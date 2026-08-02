import { getStorage, setStorage, removeStorage } from './storage.js';
import * as storageUtils from './utils/storage.js';
import { loadSettings } from './settings.js';
import { validateEntry, validateImportData } from './validation.js';
import { bufferToBase64, base64ToBuffer } from './encoding.js';
import { VAULT_KEY, META_KEY, CHUNK_SIZE, PRF_EVAL_LABEL, ALARM_NAME, SECUREPASS_DB_NAME } from './constants.js';
import { logger } from './logger.js';

const BIOMETRIC_KEY = 'securepassBiometric';
const TRUSTED_DEVICE_KEY = 'securepassTrustedDeviceKey';
const ITERATIONS   = 600000;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const STORAGE_PREFERENCE = ['sync', 'local'];

let cache = { data: null };
let unlockedPassphrase = null;

let bruteForceAttempts = 0;
let lockoutUntil = 0;



async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt.buffer);
  const encoded = ENCODER.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext),
    iterations: ITERATIONS
  };
}

async function decryptData(record, passphrase) {
  const { salt, iv, ciphertext, iterations } = record;
  const key = await deriveKey(passphrase, base64ToBuffer(salt), iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(iv)) },
    key,
    base64ToBuffer(ciphertext)
  );
  return JSON.parse(DECODER.decode(decrypted));
}

async function getDB() {
  return storageUtils.getDB();
}

async function loadVaultRecord() {
  const settings = await loadSettings();
  if (settings.useSync) {
    return storageUtils.readSyncVaultRecordRaw();
  } else {
    try {
      return await storageUtils.readLocalVaultRecordRaw();
    } catch (error) {
      logger.error('Failed to load vault from IndexedDB:', error?.message || String(error));
      return null;
    }
  }
}

async function saveVaultRecord(record) {
  const settings = await loadSettings();
  if (settings.useSync) {
    return storageUtils.writeSyncVaultRecordRaw(record);
  } else {
    return storageUtils.writeLocalVaultRecordRaw(record);
  }
}

// --- Persistence & Auto-Lock Logic ---

async function updateActivity(timeoutMinutes) {
  const now = Date.now();
  
  // Update session storage
  try {
    // We only update timestamp
    await setStorage('session', { 
      vaultLastActivity: now,
      vaultTimeoutMinutes: timeoutMinutes 
    });

    // Make auto-lock smarter: Configure OS-level idle/lock detection
    const timeoutSeconds = Math.max(60, timeoutMinutes * 60); // minimum 60s
    chrome.idle.setDetectionInterval(timeoutSeconds);

  } catch (e) {
    logger.error('Failed to configure idle detection:', e?.message || String(e));
  }

  // Backup alarm in case idle API is flaky or SW shuts down
  try {
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: timeoutMinutes });
  } catch (e) {
    logger.error('Failed to create alarm:', e?.message || String(e));
  }
}

async function restoreVaultState() {
  // For security, do not attempt to restore unlocked vault from session storage.
  // Passphrase is not stored in session in plaintext. Restoration must be
  // performed explicitly by the user (manual unlock) or via biometric flow.
  return false;
}

async function ensureUnlocked(passphrase, timeoutMinutes) {
  // If cache is empty, try to restore from session first
  if (!cache.data) {
    const restored = await restoreVaultState();
    if (restored) {
      // If restored, check if we need to update activity (usually ensureUnlocked is called before an operation)
      // So yes, we will update activity below.
    }
  }

  if (!cache.data) {
    // Still locked, try to unlock with provided passphrase
    if (passphrase) {
      await unlockVault(passphrase, timeoutMinutes || 15);
    } else {
      throw new Error('Vault is locked');
    }
  } else {
    // Already unlocked (or restored), update activity
    await updateActivity(timeoutMinutes || 15);
  }
  
  return cache.data;
}

function normalizeEntry(partial, existing) {
  const now = new Date().toISOString();
  
  const rawEntry = {
    id: partial.id || existing?.id || crypto.randomUUID(),
    site: partial.site ?? existing?.site ?? '',
    username: partial.username ?? existing?.username ?? '',
    notes: partial.notes ?? existing?.notes ?? '',
    password: partial.password || existing?.password,
    createdAt: existing?.createdAt || partial.createdAt || now
  };
  
  if (!rawEntry.password) {
    throw new Error('Password is required');
  }

  const cleanEntry = validateEntry(rawEntry, false);
  cleanEntry.updatedAt = now;
  return cleanEntry;
}

async function writeVault(data, passphrase) {
  const pass = passphrase || unlockedPassphrase;
  if (!pass) throw new Error('Passphrase required to write vault');

  const record = await encryptData(data, pass);
  await saveVaultRecord(record);
  cache.data = data;
}

export async function overwriteVaultEntries(entries, passphrase) {
  const pass = passphrase || unlockedPassphrase;
  if (!pass) throw new Error('Passphrase required to rewrite vault');

  const data = { entries: Array.isArray(entries) ? entries : [] };
  await writeVault(data, pass);
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;

  try {
    await updateActivity(timeout);
  } catch (e) {
    // Ignore session storage errors
  }

  return data;
}

// --- Public API ---

export async function vaultStatus() {
  // Try to restore state if needed (lazy load)
  if (!cache.data) {
    await restoreVaultState();
  }

  const record = await loadVaultRecord();
  return {
    initialized: Boolean(record),
    unlocked: Boolean(cache.data)
  };
}

export async function initializeVault(passphrase) {
  const record = await loadVaultRecord();
  if (record) return false;
  const payload = await encryptData({ entries: [] }, passphrase);
  await saveVaultRecord(payload);
  cache.data = { entries: [] };
  unlockedPassphrase = passphrase;
  const settings = await loadSettings();
  
  const timeout = settings.vaultTimeout || 15;
  
  // Do not persist the plaintext passphrase in session storage for security.
  // Keep only activity metadata via updateActivity.
  try {
    await updateActivity(timeout);
  } catch (e) {
    // Ignore
  }
  
  return true;
}

export async function unlockVault(passphrase, timeoutMinutes = 15) {
  if (Date.now() < lockoutUntil) {
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    throw new Error(`Vault locked due to too many failed attempts. Try again in ${remaining} seconds.`);
  }

  const record = await loadVaultRecord();
  if (!record) {
    await initializeVault(passphrase);
    return cache.data;
  }
  let data;
  try {
    data = await decryptData(record, passphrase);
    
    // Reset brute-force triggers on success
    bruteForceAttempts = 0;
    lockoutUntil = 0;
  } catch (error) {
    bruteForceAttempts++;
    if (bruteForceAttempts >= 5) {
      lockoutUntil = Date.now() + (30 * 1000); // 30 sec lockout
      bruteForceAttempts = 0;
      throw new Error('Invalid master password. Vault locked for 30 seconds.');
    }
    throw new Error('Invalid master password');
  }
  cache.data = data;
  unlockedPassphrase = passphrase;
  // Do not persist the plaintext passphrase in session storage for security.
  try {
    await updateActivity(timeoutMinutes);
  } catch (e) {
    // Ignore session storage errors
  }
  
  return data;
}

export async function lockVault() {
  if (cache.data && cache.data.entries) {
    for (let i = 0; i < cache.data.entries.length; i++) {
        const entry = cache.data.entries[i];
        entry.password = 0;
        entry.username = 0;
        entry.notes = 0;
    }
  }
  cache.data = null;
  unlockedPassphrase = null;
  
  try {
    await removeStorage('session', ['vaultLastActivity', 'vaultTimeoutMinutes']);
    await chrome.alarms.clear(ALARM_NAME);
  } catch (e) {
    // Ignore
  }
}

export async function storeCredential(entry, passphrase) {
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  const data = await ensureUnlocked(passphrase, timeout);
  const normalized = normalizeEntry(entry);
  data.entries = data.entries || [];
  data.entries.push(normalized);
  const pass = passphrase || unlockedPassphrase;
  if (!pass) throw new Error('Passphrase required');

  await writeVault(data, pass);
  await updateActivity(timeout);
  await saveCredentialMeta(normalized);
  return normalized;
}

export async function updateCredential(id, updates, passphrase) {
  if (!id) throw new Error('Missing credential id');
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  const data = await ensureUnlocked(passphrase, timeout);
  data.entries = data.entries || [];
  const index = data.entries.findIndex(item => item.id === id);
  if (index === -1) throw new Error('Credential not found');
  const updated = normalizeEntry({ ...updates, id }, data.entries[index]);
  data.entries[index] = updated;
  const pass = passphrase || unlockedPassphrase;
  if (!pass) throw new Error('Passphrase required');

  await writeVault(data, pass);
  await updateActivity(timeout);
  await saveCredentialMeta(updated);
  return updated;
}

export async function deleteCredential(id, passphrase) {
  if (!id) throw new Error('Missing credential id');
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  const data = await ensureUnlocked(passphrase, timeout);
  data.entries = data.entries || [];
  const index = data.entries.findIndex(item => item.id === id);
  if (index === -1) throw new Error('Credential not found');
  data.entries.splice(index, 1);
  const pass = passphrase || unlockedPassphrase;
  if (!pass) throw new Error('Passphrase required');

  await writeVault(data, pass);
  await updateActivity(timeout);
  await removeCredentialMeta(id);
}

export async function changeMasterPassword(oldPassphrase, newPassphrase) {
  if (!newPassphrase) {
    throw new Error('New master password required');
  }
  const record = await loadVaultRecord();
  if (!record) {
    throw new Error('Vault not initialized');
  }
  let data;
  const currentPassphrase = oldPassphrase || unlockedPassphrase;
  if (!currentPassphrase) {
    throw new Error('Current master password required');
  }
  try {
    data = await decryptData(record, currentPassphrase);
  } catch (error) {
    throw new Error('Invalid current master password');
  }
  const newRecord = await encryptData(data, newPassphrase);
  await saveVaultRecord(newRecord);
  cache.data = data;
  unlockedPassphrase = newPassphrase;
  
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  
  // Do not persist plaintext passphrase. Update activity metadata only.
  try {
    await updateActivity(timeout);
  } catch (e) {
    // Ignore
  }
}

export async function listCredentials() {
  // Try restore if needed
  if (!cache.data) {
    await restoreVaultState();
  }
  
  if (cache.data) {
    // Update activity on list? Yes, viewing the vault counts as activity.
    // We need to know the timeout.
    // We can get it from session or settings.
    try {
        const session = await getStorage('session', 'vaultTimeoutMinutes');
        const timeout = session.vaultTimeoutMinutes || 15;
       await updateActivity(timeout);
    } catch(e) {}
  }

  return cache.data ? [...(cache.data.entries || [])] : [];
}

export async function importVaultData(data, passphrase) {
  const cleanData = validateImportData(data);
  const newEntries = cleanData.entries;

  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;

  await ensureUnlocked(passphrase, timeout);

  const pass = passphrase || unlockedPassphrase;
  if (!pass) throw new Error('Passphrase required to import');

  const currentData = cache.data;
  const existingEntries = currentData.entries || [];
  const updatedData = { ...currentData, entries: [...existingEntries, ...newEntries] };

  await writeVault(updatedData, pass);
  await updateActivity(timeout);
  // Sync metadata store
  for (const entry of newEntries) await saveCredentialMeta(entry);
  return newEntries.length;
}

export async function keepAlive() {
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  if (cache.data) {
    await updateActivity(timeout);
    return true;
  }
  return false;
}

// ─── Metadata Store ────────────────────────────────────────────────────────────
// Stores {id, username, site} without passwords.
// Allows showing credential stubs even when vault is locked.

async function saveCredentialMeta(entry) {
  try {
    const items = await getStorage('local', META_KEY);
    const meta = items[META_KEY] || [];
    const { id, username, site, createdAt, updatedAt } = entry;
    const record = { id, username: username || '', site: site || '', createdAt, updatedAt };
    const idx = meta.findIndex(m => m.id === id);
    if (idx >= 0) meta[idx] = record;
    else meta.push(record);
    await setStorage('local', { [META_KEY]: meta });
  } catch (e) {
    logger.warn('SecurePass: failed to save credential meta:', e?.message || String(e));
  }
}

async function removeCredentialMeta(id) {
  try {
    const items = await getStorage('local', META_KEY);
    const meta = (items[META_KEY] || []).filter(m => m.id !== id);
    await setStorage('local', { [META_KEY]: meta });
  } catch (e) {
    logger.warn('SecurePass: failed to remove credential meta:', e?.message || String(e));
  }
}

export async function listCredentialsMeta() {
  try {
    const items = await getStorage('local', META_KEY);
    return items[META_KEY] || [];
  } catch {
    return [];
  }
}

// Backfill: syncs the metadata store from vault entries.
// Called when vault is unlocked to ensure pre-existing credentials have metadata.
export async function syncMetadataFromEntries(entries) {
  if (!entries || !entries.length) return;
  try {
    const items = await getStorage('local', META_KEY);
    const meta = items[META_KEY] || [];
    const existingIds = new Set(meta.map(m => m.id));
    let changed = false;
    for (const entry of entries) {
      if (!existingIds.has(entry.id)) {
        meta.push({
          id: entry.id,
          username: entry.username || '',
          site: entry.site || '',
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
        changed = true;
      }
    }
    if (changed) {
      await setStorage('local', { [META_KEY]: meta });
    }
  } catch (e) {
    logger.warn('SecurePass: failed to sync metadata:', e?.message || String(e));
  }
}

// ─── Biometric / WebAuthn Helpers ─────────────────────────────────────────────

export function getPRFEvalLabel() { return PRF_EVAL_LABEL; }

export async function getBiometricData() {
  const items = await getStorage('local', BIOMETRIC_KEY);
  return items[BIOMETRIC_KEY] || null;
}

export async function isBiometricEnabled() {
  const d = await getBiometricData();
  return d?.enabled === true;
}

export async function clearBiometricData() {
  await removeStorage('local', BIOMETRIC_KEY);
}

export async function saveBiometricSetup(credentialId, encryptedPassphrase, prfAvailable, mode = 'prf-unlock') {
  await setStorage('local', {
    [BIOMETRIC_KEY]: {
      enabled: true,
      credentialId,
      encryptedPassphrase,
      prfAvailable,
      mode,
      createdAt: new Date().toISOString(),
    }
  });
}

async function getOrCreateTrustedDeviceKey() {
  const existing = await getStorage('local', TRUSTED_DEVICE_KEY);
  if (existing?.[TRUSTED_DEVICE_KEY]) {
    return base64ToBuffer(existing[TRUSTED_DEVICE_KEY]);
  }

  const raw = crypto.getRandomValues(new Uint8Array(32));
  await setStorage('local', { [TRUSTED_DEVICE_KEY]: bufferToBase64(raw.buffer) });
  return raw.buffer;
}

async function importTrustedDeviceAesKey() {
  const keyBytes = await getOrCreateTrustedDeviceKey();
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function clearTrustedDeviceKey() {
  await removeStorage('local', TRUSTED_DEVICE_KEY);
}

export async function encryptPassphraseWithTrustedDevice(passphrase) {
  const key = await importTrustedDeviceAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENCODER.encode(passphrase));
  return { iv: bufferToBase64(iv.buffer), ciphertext: bufferToBase64(ct) };
}

export async function decryptPassphraseWithTrustedDevice(encryptedData) {
  const key = await importTrustedDeviceAesKey();
  const iv = new Uint8Array(base64ToBuffer(encryptedData.iv));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBuffer(encryptedData.ciphertext)
  );
  return DECODER.decode(decrypted);
}

// Derives an AES-256-GCM key from a WebAuthn PRF output via HKDF.
async function prfToAesKey(prfB64) {
  const raw = base64ToBuffer(prfB64);
  const base = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: ENCODER.encode(PRF_EVAL_LABEL) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPassphraseWithPRF(passphrase, prfB64) {
  const key = await prfToAesKey(prfB64);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENCODER.encode(passphrase));
  return { iv: bufferToBase64(iv.buffer), ciphertext: bufferToBase64(ct) };
}

export async function decryptPassphraseWithPRF(encryptedData, prfB64) {
  const key      = await prfToAesKey(prfB64);
  const iv       = new Uint8Array(base64ToBuffer(encryptedData.iv));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBuffer(encryptedData.ciphertext)
  );
  return DECODER.decode(decrypted);
}
