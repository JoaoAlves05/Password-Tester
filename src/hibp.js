import { loadSettings } from './settings.js';

const API_URL = 'https://api.pwnedpasswords.com/range/';

async function sha1(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function getCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(['hibpCache'], data => {
      resolve(data.hibpCache || {});
    });
  });
}

async function setCache(cache) {
  return new Promise(resolve => {
    chrome.storage.local.set({ hibpCache: cache }, resolve);
  });
}

async function getCacheTtl() {
  const settings = await loadSettings();
  const hours = settings.hibpCacheTtlHours || 24;
  return hours * 60 * 60 * 1000;
}

export async function checkPassword(password) {
  if (!password) {
    return { compromised: false, count: 0 };
  }

  const hash = await sha1(password);
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5);
  const cacheKey = `${prefix}`;
  const cache = await getCache();

  const entry = cache[cacheKey];
  const now = Date.now();
  let responseText;

  const cacheTtl = await getCacheTtl();

  if (entry && now - entry.timestamp < cacheTtl) {
    responseText = entry.payload;
  } else {
    let res;
    try {
      res = await fetch(API_URL + prefix, {
        method: 'GET',
        headers: {
          'Add-Padding': 'true'
        }
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
    cache[cacheKey] = {
      payload: responseText,
      timestamp: now
    };
    await setCache(cache);
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
