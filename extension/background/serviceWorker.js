import { checkPassword } from '../src/hibp.js';
import { generatePassword } from '../src/passwordGenerator.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings.js';
import {
  initializeVault,
  unlockVault,
  storeCredential,
  updateCredential,
  deleteCredential,
  listCredentials,
  lockVault,
  vaultStatus,
  changeMasterPassword,
  importVaultData,
  keepAlive
} from '../src/cryptoVault.js';
import { validateString, validateEntry, validateConstraints, validateImportData } from '../src/validation.js';

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  await saveSettings({ ...DEFAULT_SETTINGS, ...settings });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'HIBP_CHECK': {
        try {
          const password = validateString(message.password, 1024, 'password', true);
          const result = await checkPassword(password);
          sendResponse({ ok: true, result });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'GENERATE_PASSWORD': {
        try {
          const constraints = validateConstraints(message.constraints);
          const generated = await generatePassword(constraints);
          sendResponse({ ok: true, password: generated });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'LOAD_SETTINGS': {
        const settings = await loadSettings();
        sendResponse({ ok: true, settings });
        break;
      }
      case 'SAVE_SETTINGS': {
        // Assume settings module handles this safely or add validation
        await saveSettings(message.settings);
        sendResponse({ ok: true });
        break;
      }
      case 'UNLOCK_VAULT': {
        try {
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
          await initializeVault(passphrase);
          const data = await unlockVault(passphrase, message.timeoutMinutes);
          sendResponse({ ok: true, data });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'STORE_CREDENTIAL': {
        try {
          const entry = validateEntry(message.entry);
          if (!entry.password) throw new Error('Password is required');
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', false);
          const stored = await storeCredential(entry, passphrase);
          sendResponse({ ok: true, entry: stored });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'UPDATE_CREDENTIAL': {
        try {
          const id = validateString(message.id, 64, 'id', true);
          const updates = validateEntry(message.updates, true);
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', false);
          const entry = await updateCredential(id, updates, passphrase);
          sendResponse({ ok: true, entry });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'DELETE_CREDENTIAL': {
        try {
          const id = validateString(message.id, 64, 'id', true);
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', false);
          await deleteCredential(id, passphrase);
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'LIST_CREDENTIALS': {
        const status = await vaultStatus();
        const entries = await listCredentials();
        sendResponse({ ok: true, entries, unlocked: status.unlocked });
        break;
      }
      case 'LOCK_VAULT': {
        lockVault();
        sendResponse({ ok: true });
        break;
      }
      case 'VAULT_STATUS': {
        const status = await vaultStatus();
        sendResponse({ ok: true, status });
        break;
      }
      case 'INITIALIZE_VAULT': {
        try {
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
          const created = await initializeVault(passphrase);
          sendResponse({ ok: true, created });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'CHANGE_MASTER_PASSWORD': {
        try {
          const oldPassphrase = validateString(message.oldPassphrase, 1024, 'oldPassphrase', true);
          const newPassphrase = validateString(message.newPassphrase, 1024, 'newPassphrase', true);
          await changeMasterPassword(oldPassphrase, newPassphrase);
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'EXPORT_VAULT': {
        try {
          const status = await vaultStatus();
          if (!status.unlocked) {
            sendResponse({ ok: false, error: 'Vault is locked' });
            return;
          }
          const entries = await listCredentials();
          sendResponse({ ok: true, data: { entries } });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'IMPORT_VAULT': {
        try {
          const status = await vaultStatus();
          if (!status.unlocked) {
            sendResponse({ ok: false, error: 'Vault is locked' });
            return;
          }
          
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
          const cleanData = validateImportData(message.data);
          
          const count = await importVaultData(cleanData, passphrase);
          sendResponse({ ok: true, count });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'KEEP_ALIVE': {
        try {
          const alive = await keepAlive();
          sendResponse({ ok: true, alive });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }

      case 'SCHEDULE_CLIPBOARD_CLEAR': {
        const { timeout } = message;
        if (timeout > 0) {
          await chrome.alarms.create('clearClipboard', { delayInMinutes: timeout / 60 });
        }
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  };

  handler();
  return true;
});

// --- Clipboard Auto-Clear Logic ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'clearClipboard') {
    await clearClipboardFromBackground();
  } else if (alarm.name === 'vaultAutoLock') {
    lockVault();
  }
});

async function clearClipboardFromBackground() {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      type: 'CLEAR_CLIPBOARD',
      target: 'offscreen'
    });
  } catch (error) {
    console.error('Failed to clear clipboard:', error);
  }
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: ['offscreen.html']
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Clear clipboard after timeout'
  });
}
