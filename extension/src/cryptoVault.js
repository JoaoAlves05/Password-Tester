import { getStorage, setStorage } from './storage.js';
import { loadSettings } from './settings.js';
import { validateEntry, validateImportData } from './validation.js';

const VAULT_KEY    = 'securepassVault';
const META_KEY     = 'securepassMeta';
const BIOMETRIC_KEY = 'securepassBiometric';
const ITERATIONS   = 600000;
const CHUNK_SIZE   = 7000;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const STORAGE_PREFERENCE = ['sync', 'local'];
const ALARM_NAME = 'vaultAutoLock';
const PRF_EVAL_LABEL = 'securepass-master-key-v1';

let cache = { data: null };

let bruteForceAttempts = 0;
let lockoutUntil = 0;

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

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
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SecurePassDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('vault')) {
        db.createObjectStore('vault');
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadVaultRecord() {
  const settings = await loadSettings();
  if (settings.useSync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, items => {
        if (chrome.runtime.lastError) return resolve(null);
        if (items[`${VAULT_KEY}_manifest`]) {
          try {
            const manifest = items[`${VAULT_KEY}_manifest`];
            let fullString = '';
            for (let i = 0; i < manifest.chunks; i++) {
              if (items[`${VAULT_KEY}_chunk_${i}`] === undefined) {
                return resolve(null); // corrupted
              }
              fullString += items[`${VAULT_KEY}_chunk_${i}`];
            }
            resolve(JSON.parse(fullString));
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  } else {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('vault', 'readonly');
        const store = tx.objectStore('vault');
        const request = store.get(VAULT_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load vault from IndexedDB:', error);
      return null;
    }
  }
}

async function saveVaultRecord(record) {
  const settings = await loadSettings();
  if (settings.useSync) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(`${VAULT_KEY}_manifest`, (items) => {
        const oldManifest = items[`${VAULT_KEY}_manifest`];
        const oldChunksCount = oldManifest ? oldManifest.chunks : 0;
        
        const serialized = JSON.stringify(record);
        const chunkCount = Math.ceil(serialized.length / CHUNK_SIZE);
        const payload = {
          [`${VAULT_KEY}_manifest`]: { chunks: chunkCount, updatedAt: Date.now() }
        };
        
        let chunkIdx = 0;
        for (let i = 0; i < serialized.length; i += CHUNK_SIZE) {
          payload[`${VAULT_KEY}_chunk_${chunkIdx}`] = serialized.substring(i, i + CHUNK_SIZE);
          chunkIdx++;
        }
        
        const keysToRemove = [];
        for (let i = chunkIdx; i < oldChunksCount; i++) {
           keysToRemove.push(`${VAULT_KEY}_chunk_${i}`);
        }
        
        const doSet = () => {
          chrome.storage.sync.set(payload, () => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve();
          });
        };
        
        if (keysToRemove.length > 0) {
          chrome.storage.sync.remove(keysToRemove, () => {
             if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
             doSet();
          });
        } else {
          doSet();
        }
      });
    });
  } else {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readwrite');
      const store = tx.objectStore('vault');
      const request = store.put(record, VAULT_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// --- Persistence & Auto-Lock Logic ---

async function updateActivity(timeoutMinutes) {
  const now = Date.now();
  
  // Update session storage
  try {
    // We only update timestamp
    await chrome.storage.session.set({ 
      vaultLastActivity: now,
      vaultTimeoutMinutes: timeoutMinutes 
    });

    // Make auto-lock smarter: Configure OS-level idle/lock detection
    const timeoutSeconds = Math.max(60, timeoutMinutes * 60); // minimum 60s
    chrome.idle.setDetectionInterval(timeoutSeconds);

  } catch (e) {
    console.error('Failed to configure idle detection:', e);
  }

  // Backup alarm in case idle API is flaky or SW shuts down
  try {
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: timeoutMinutes });
  } catch (e) {
    console.error('Failed to create alarm:', e);
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
  const pass = passphrase;
  if (!pass) throw new Error('Passphrase required to write vault');

  const record = await encryptData(data, pass);
  await saveVaultRecord(record);
  cache.data = data;
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
  
  try {
    await chrome.storage.session.remove(['vaultLastActivity', 'vaultTimeoutMinutes']);
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
  const pass = passphrase;
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
  const pass = passphrase;
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
  const pass = passphrase;
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
  try {
    data = await decryptData(record, oldPassphrase);
  } catch (error) {
    throw new Error('Invalid current master password');
  }
  const newRecord = await encryptData(data, newPassphrase);
  await saveVaultRecord(newRecord);
  cache.data = data;
  
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
       const session = await chrome.storage.session.get('vaultTimeoutMinutes');
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

  const pass = passphrase;
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
    const items = await chrome.storage.local.get(META_KEY);
    const meta = items[META_KEY] || [];
    const { id, username, site, createdAt, updatedAt } = entry;
    const record = { id, username: username || '', site: site || '', createdAt, updatedAt };
    const idx = meta.findIndex(m => m.id === id);
    if (idx >= 0) meta[idx] = record;
    else meta.push(record);
    await chrome.storage.local.set({ [META_KEY]: meta });
  } catch (e) {
    console.warn('SecurePass: failed to save credential meta', e);
  }
}

async function removeCredentialMeta(id) {
  try {
    const items = await chrome.storage.local.get(META_KEY);
    const meta = (items[META_KEY] || []).filter(m => m.id !== id);
    await chrome.storage.local.set({ [META_KEY]: meta });
  } catch (e) {
    console.warn('SecurePass: failed to remove credential meta', e);
  }
}

export async function listCredentialsMeta() {
  try {
    const items = await chrome.storage.local.get(META_KEY);
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
    const items = await chrome.storage.local.get(META_KEY);
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
      await chrome.storage.local.set({ [META_KEY]: meta });
    }
  } catch (e) {
    console.warn('SecurePass: failed to sync metadata', e);
  }
}

// ─── Biometric / WebAuthn Helpers ─────────────────────────────────────────────

export function getPRFEvalLabel() { return PRF_EVAL_LABEL; }

export async function getBiometricData() {
  const items = await chrome.storage.local.get(BIOMETRIC_KEY);
  return items[BIOMETRIC_KEY] || null;
}

export async function isBiometricEnabled() {
  const d = await getBiometricData();
  return d?.enabled === true;
}

export async function clearBiometricData() {
  await chrome.storage.local.remove(BIOMETRIC_KEY);
}

export async function saveBiometricSetup(credentialId, encryptedPassphrase, prfAvailable) {
  await chrome.storage.local.set({
    [BIOMETRIC_KEY]: { enabled: true, credentialId, encryptedPassphrase, prfAvailable, createdAt: new Date().toISOString() }
  });
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
