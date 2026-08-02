/**
 * messaging.js — Chrome runtime message wrapper for the popup.
 *
 * Centralises all chrome.runtime.sendMessage calls so that:
 *  - Error handling is consistent across the entire popup.
 *  - The chrome API is only referenced in one place, making future
 *    refactors (e.g. migrating to MV4 or testing with mocks) easy.
 */

/**
 * Sends a message to the background service worker and returns a Promise
 * that resolves with the response object.
 *
 * @param {string} type   - Message type constant (e.g. 'UNLOCK_VAULT').
 * @param {object} payload - Additional payload fields merged into the message.
 * @returns {Promise<{ok: boolean, [key: string]: any}>}
 */
export async function sendMessage(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, response => {
      if (chrome.runtime.lastError) {
        return resolve({ ok: false, error: chrome.runtime.lastError.message });
      }
      resolve(response || { ok: false, error: 'No response from background.' });
    });
  });
}
