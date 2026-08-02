import { loadSettings } from '../settings.js';

export async function copyToClipboard(value, timeoutOverride = null) {
  try {
    await navigator.clipboard.writeText(value);

    let timeout = timeoutOverride;
    if (timeout === null) {
      const settings = await loadSettings();
      timeout = settings.clipboardTimeout ?? 30;
    }

    if (timeout > 0 && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SCHEDULE_CLIPBOARD_CLEAR',
        timeout
      }, () => {
        // Suppress unchecked runtime.lastError
        const _ = chrome.runtime.lastError;
      });
    }

    return true;
  } catch (error) {
    return false;
  }
}
