import { getStorage, setStorage } from './storage.js';
import { loadSettings } from './settings.js';

const VAULT_KEY = 'securepassVault';
const ITERATIONS = 600000;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const STORAGE_PREFERENCE = ['sync', 'local'];
const ALARM_NAME = 'vaultAutoLock';

let cache = {
  data: null
};

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

async function saveVaultRecord(record) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vault', 'readwrite');
    const store = tx.objectStore('vault');
    const request = store.put(record, VAULT_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Persistence & Auto-Lock Logic ---

async function updateActivity(timeoutMinutes) {
  const now = Date.now();
  
  // Update session storage
  try {
    // We only update timestamp, assuming passphrase is already there
    await chrome.storage.session.set({ 
      vaultLastActivity: now,
      vaultTimeoutMinutes: timeoutMinutes 
    });
  } catch (e) {
    console.error('Failed to update session activity:', e);
  }

  // Reset Alarm
  // We set the alarm to fire when the timeout expires from NOW.
  // This ensures that even if the browser is open but SW is idle, the alarm will wake it up to lock.
  try {
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: timeoutMinutes });
  } catch (e) {
    console.error('Failed to create alarm:', e);
  }
}

async function restoreVaultState() {
  try {
    const session = await chrome.storage.session.get(['vaultPassphrase', 'vaultLastActivity', 'vaultTimeoutMinutes']);
    if (!session.vaultPassphrase) {
      return false;
    }

    const now = Date.now();
    const lastActivity = session.vaultLastActivity || 0;
    const timeoutMinutes = session.vaultTimeoutMinutes || 15;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    if (now - lastActivity > timeoutMs) {
      // Timeout expired while SW was dead or browser was closed (but session persisted? unlikely for browser close, but possible for SW)
      await lockVault();
      return false;
    }

    // Valid session, restore data
    const record = await loadVaultRecord();
    if (!record) return false;

    try {
      const data = await decryptData(record, session.vaultPassphrase);
      cache.data = data;
      // Refresh activity on restore? No, only on explicit action.
      // But we should ensure the alarm is active.
      // If SW just woke up, alarm might have fired or be pending.
      // Let's reset it to remaining time?
      // Actually, just creating it again with delayInMinutes overwrites it.
      // Calculate remaining minutes
      const remainingMs = timeoutMs - (now - lastActivity);
      const remainingMins = Math.max(0.1, remainingMs / 60000);
      await chrome.alarms.create(ALARM_NAME, { delayInMinutes: remainingMins });
      
      return true;
    } catch (e) {
      await lockVault();
      return false;
    }
  } catch (e) {
    return false;
  }
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
  const password = partial.password || existing?.password;
  if (!password) {
    throw new Error('Password is required');
  }

  return {
    id: partial.id || existing?.id || crypto.randomUUID(),
    site: (partial.site ?? existing?.site ?? '').trim(),
    username: (partial.username ?? existing?.username ?? '').trim(),
    notes: (partial.notes ?? existing?.notes ?? '').trim(),
    password,
    createdAt: existing?.createdAt || partial.createdAt || now,
    updatedAt: now
  };
}

async function writeVault(data, passphrase) {
  // If we don't have passphrase passed explicitly, try to get from session
  let pass = passphrase;
  if (!pass) {
    const session = await chrome.storage.session.get('vaultPassphrase');
    pass = session.vaultPassphrase;
  }
  
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
  
  try {
    await chrome.storage.session.set({ 
      vaultPassphrase: passphrase,
      vaultLastActivity: Date.now(),
      vaultTimeoutMinutes: timeout
    });
    await updateActivity(timeout);
  } catch (e) {
    // Ignore
  }
  
  return true;
}

export async function unlockVault(passphrase, timeoutMinutes = 15) {
  const record = await loadVaultRecord();
  if (!record) {
    await initializeVault(passphrase);
    return cache.data;
  }
  let data;
  try {
    data = await decryptData(record, passphrase);
  } catch (error) {
    throw new Error('Invalid master password');
  }
  cache.data = data;
  
  // Store session state
  try {
    await chrome.storage.session.set({ 
      vaultPassphrase: passphrase,
      vaultLastActivity: Date.now(),
      vaultTimeoutMinutes: timeoutMinutes
    });
    await updateActivity(timeoutMinutes);
  } catch (e) {
    // Ignore session storage errors
  }
  
  return data;
}

export async function lockVault() {
  cache.data = null;
  
  try {
    await chrome.storage.session.remove(['vaultPassphrase', 'vaultLastActivity', 'vaultTimeoutMinutes']);
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
  
  // If passphrase not provided (e.g. from popup where we rely on session), ensureUnlocked handles it?
  // ensureUnlocked returns data. writeVault needs passphrase.
  // We need to ensure we have the passphrase.
  // If ensureUnlocked restored from session, we don't have 'passphrase' arg populated if caller didn't send it.
  // So we should fetch it from session if missing.
  
  let pass = passphrase;
  if (!pass) {
    const session = await chrome.storage.session.get('vaultPassphrase');
    pass = session.vaultPassphrase;
  }

  await writeVault(data, pass);
  await updateActivity(timeout);
  return normalized;
}

export async function updateCredential(id, updates, passphrase) {
  if (!id) throw new Error('Missing credential id');
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  const data = await ensureUnlocked(passphrase, timeout);
  data.entries = data.entries || [];
  const index = data.entries.findIndex(item => item.id === id);
  if (index === -1) {
    throw new Error('Credential not found');
  }
  const updated = normalizeEntry({ ...updates, id }, data.entries[index]);
  data.entries[index] = updated;
  
  let pass = passphrase;
  if (!pass) {
    const session = await chrome.storage.session.get('vaultPassphrase');
    pass = session.vaultPassphrase;
  }

  await writeVault(data, pass);
  await updateActivity(timeout);
  return updated;
}

export async function deleteCredential(id, passphrase) {
  if (!id) throw new Error('Missing credential id');
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  const data = await ensureUnlocked(passphrase, timeout);
  data.entries = data.entries || [];
  const index = data.entries.findIndex(item => item.id === id);
  if (index === -1) {
    throw new Error('Credential not found');
  }
  data.entries.splice(index, 1);
  
  let pass = passphrase;
  if (!pass) {
    const session = await chrome.storage.session.get('vaultPassphrase');
    pass = session.vaultPassphrase;
  }

  await writeVault(data, pass);
  await updateActivity(timeout);
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
  
  // Update session with new password
  try {
    await chrome.storage.session.set({ 
      vaultPassphrase: newPassphrase,
      vaultLastActivity: Date.now(),
      vaultTimeoutMinutes: timeout
    });
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
  console.log('Importing vault data:', data);
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid vault data format: not an object');
  }
  
  let entries = data.entries;
  if (!entries && Array.isArray(data)) {
    entries = data;
  }
  
  if (!Array.isArray(entries)) {
    throw new Error('Invalid vault data format: missing entries array');
  }
  
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  
  await ensureUnlocked(passphrase, timeout);
  
  const newEntries = entries.map(entry => normalizeEntry(entry));
  
  // Load existing data to append to
  // ensureUnlocked might have restored it, or we use passphrase
  // If ensureUnlocked used session, passphrase arg might be undefined/null if not passed.
  // But importVaultData is usually called with explicit passphrase from UI prompt?
  // Actually, in my previous fix for import, I enforced passphrase.
  // But if the vault is ALREADY unlocked, we might not need it if we can get it from session.
  
  let pass = passphrase;
  if (!pass) {
    const session = await chrome.storage.session.get('vaultPassphrase');
    pass = session.vaultPassphrase;
  }
  
  if (!pass) throw new Error('Passphrase required to import');

  // We need to re-read data to be sure we have latest
  const currentData = cache.data; 
  const existingEntries = currentData.entries || [];
  
  const updatedData = {
    ...currentData,
    entries: [...existingEntries, ...newEntries]
  };
  
  await writeVault(updatedData, pass);
  await updateActivity(timeout);
  await writeVault(updatedData, pass);
  await updateActivity(timeout);
  return newEntries.length;
}

export async function keepAlive() {
  const settings = await loadSettings();
  const timeout = settings.vaultTimeout || 15;
  // Only update if unlocked
  if (cache.data) {
    await updateActivity(timeout);
    return true;
  }
  return false;
}
