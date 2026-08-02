import { loadSettings } from './settings.js';
import { getStorage, setStorage } from './utils/storage.js';

const API_URL = 'https://api.pwnedpasswords.com/range/';

// Singleton encoder — avoids allocating a new TextEncoder on every call.
const ENCODER = new TextEncoder();

// Maximum number of prefix buckets to keep in the cache.
// Each HIBP response is ~25 KB, so 200 entries ≈ 5 MB maximum.
const MAX_CACHE_ENTRIES = 200;

async function sha1(message) {
  const data = ENCODER.encode(message);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function getCache() {
  const data = await getStorage('local', ['hibpCache']);
  return data.hibpCache || {};
}

async function setCache(cache) {
  await setStorage('local', { hibpCache: cache });
}

async function getCacheTtl() {
  const settings = await loadSettings();
  const hours = settings.hibpCacheTtlHours || 24;
  return hours * 60 * 60 * 1000;
}

/**
 * Removes expired entries from the cache object and, if the cache exceeds
 * MAX_CACHE_ENTRIES, evicts the oldest entries (LRU-approximation by timestamp).
 */
function pruneCache(cache, ttl) {
  const now = Date.now();

  // Remove expired entries
  for (const key of Object.keys(cache)) {
    if (!cache[key]?.timestamp || now - cache[key].timestamp >= ttl) {
      delete cache[key];
    }
  }

  // If still oversized, evict the oldest entries
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys
      .sort((a, b) => (cache[a]?.timestamp ?? 0) - (cache[b]?.timestamp ?? 0))
      .slice(0, keys.length - MAX_CACHE_ENTRIES)
      .forEach(k => delete cache[k]);
  }

  return cache;
}

export async function checkPassword(password) {
  if (!password) {
    return { compromised: false, count: 0 };
  }

  const hash = await sha1(password);
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5);
  const cache = await getCache();
  const now = Date.now();
  const cacheTtl = await getCacheTtl();
  let responseText;

  const entry = cache[prefix];

  if (entry && now - entry.timestamp < cacheTtl) {
    responseText = entry.payload;
  } else {
    let res;
    try {
      res = await fetch(API_URL + prefix, {
        method: 'GET',
        headers: { 'Add-Padding': 'true' }
      });
    } catch (error) {
      if (error instanceof TypeError) {
        // Some environments block custom headers (triggering a CORS failure).
        // Retry without the padding header so the lookup can still succeed.
        res = await fetch(API_URL + prefix, { method: 'GET' });
      } else {
        throw error;
      }
    }

    if (!res.ok) {
      throw new Error(`HIBP request failed with status ${res.status}`);
    }

    responseText = await res.text();

    // Prune stale/excess entries before storing the new one to keep storage lean.
    const pruned = pruneCache(cache, cacheTtl);
    pruned[prefix] = { payload: responseText, timestamp: now };
    await setCache(pruned);
  }

  const lines = responseText.split('\n');
  for (const line of lines) {
    const [hashSuffix, count] = line.trim().split(':');
    if (hashSuffix === suffix) {
      return { compromised: true, count: parseInt(count, 10) };
    }
  }
  return { compromised: false, count: 0 };
}
