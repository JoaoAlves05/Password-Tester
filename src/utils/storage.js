import { VAULT_KEY, CHUNK_SIZE, SECUREPASS_DB_NAME, DB_VERSION, DB_STORE_NAME } from '../constants.js';

function handleRuntimeError(reject) {
  const err = chrome.runtime?.lastError;
  if (err) {
    reject(new Error(err.message));
    return true;
  }
  return false;
}

export function getStorage(area = 'local', keys = null) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].get(keys, items => {
        if (!handleRuntimeError(reject)) resolve(items);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function setStorage(area = 'local', items) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].set(items, () => {
        if (!handleRuntimeError(reject)) resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function removeStorage(area = 'local', keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].remove(keys, () => {
        if (!handleRuntimeError(reject)) resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function clearStorage(area = 'local') {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].clear(() => {
        if (!handleRuntimeError(reject)) resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function onStorageChanged(listener) {
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function deleteIndexedDb(name) {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error(`Failed to delete ${name}`));
      request.onblocked = () => reject(new Error(`Unable to delete ${name} because it is still open.`));
    } catch (e) {
      reject(e);
    }
  });
}

export function getDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(SECUREPASS_DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
          db.createObjectStore(DB_STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function readLocalVaultRecordRaw() {
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_NAME, 'readonly');
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      const store = tx.objectStore(DB_STORE_NAME);
      const request = store.get(VAULT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function writeLocalVaultRecordRaw(record) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_NAME, 'readwrite');
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    const store = tx.objectStore(DB_STORE_NAME);
    const request = store.put(record, VAULT_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function readSyncVaultRecordRaw() {
  try {
    const items = await getStorage('sync', null);
    const manifest = items[`${VAULT_KEY}_manifest`];
    if (!manifest || typeof manifest.chunks !== 'number' || manifest.chunks < 1) return null;
    try {
      let fullString = '';
      for (let i = 0; i < manifest.chunks; i += 1) {
        const chunk = items[`${VAULT_KEY}_chunk_${i}`];
        if (chunk === undefined) return null;
        fullString += chunk;
      }
      return JSON.parse(fullString);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function writeSyncVaultRecordRaw(record) {
  const items = await getStorage('sync', `${VAULT_KEY}_manifest`);
  const oldManifest = items[`${VAULT_KEY}_manifest`];
  const oldChunksCount = oldManifest ? oldManifest.chunks : 0;

  const serialized = JSON.stringify(record);
  const chunkCount = Math.ceil(serialized.length / CHUNK_SIZE);
  const payload = { [`${VAULT_KEY}_manifest`]: { chunks: chunkCount, updatedAt: Date.now() } };

  let chunkIdx = 0;
  for (let i = 0; i < serialized.length; i += CHUNK_SIZE) {
    payload[`${VAULT_KEY}_chunk_${chunkIdx}`] = serialized.substring(i, i + CHUNK_SIZE);
    chunkIdx += 1;
  }

  const keysToRemove = [];
  for (let i = chunkIdx; i < oldChunksCount; i += 1) keysToRemove.push(`${VAULT_KEY}_chunk_${i}`);

  if (keysToRemove.length) {
    await removeStorage('sync', keysToRemove);
  }
  await setStorage('sync', payload);
}
