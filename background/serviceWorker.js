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
  listCredentialsMeta,
  lockVault,
  vaultStatus,
  changeMasterPassword,
  importVaultData,
  keepAlive,
  syncMetadataFromEntries,
  getBiometricData,
  isBiometricEnabled,
  clearBiometricData,
  saveBiometricSetup,
  encryptPassphraseWithPRF,
  decryptPassphraseWithPRF,
} from '../src/cryptoVault.js';
import { validateString, validateEntry, validateConstraints, validateImportData } from '../src/validation.js';

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

const pendingSaves = new Map();
const BIOMETRIC_SESSION_PASSPHRASE_KEY = 'biometricSessionPassphrase';

async function setBiometricSessionPassphrase(passphrase) {
  if (!passphrase) return;
  await chrome.storage.session.set({ [BIOMETRIC_SESSION_PASSPHRASE_KEY]: passphrase });
}

async function getBiometricSessionPassphrase() {
  const result = await chrome.storage.session.get(BIOMETRIC_SESSION_PASSPHRASE_KEY);
  return result?.[BIOMETRIC_SESSION_PASSPHRASE_KEY] || '';
}

async function clearBiometricSessionPassphrase() {
  await chrome.storage.session.remove(BIOMETRIC_SESSION_PASSPHRASE_KEY);
}

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
          await setBiometricSessionPassphrase(passphrase);
          sendResponse({ ok: true, data });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'PROMPT_SAVE_CREDENTIAL': {
        const { entry, origin } = message;
        const status = await vaultStatus();
        if (!status.unlocked) {
          sendResponse({ ok: false, error: 'Vault is locked' });
          break;
        }
        
        const notifId = `save_cred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        chrome.notifications.create(notifId, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: 'SecurePass - Save Credential?',
          message: `Do you want to save the new password for ${entry.username || 'this account'} on ${origin}?`,
          buttons: [
            { title: 'Save' },
            { title: 'Ignore' }
          ],
          priority: 2
        });
        
        pendingSaves.set(notifId, entry);
        sendResponse({ ok: true });
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
        // Backfill metadata for pre-existing credentials (before metadata feature)
        if (status.unlocked && entries.length) {
          syncMetadataFromEntries(entries).catch(() => {});
        }
        sendResponse({ ok: true, entries, unlocked: status.unlocked, initialized: status.initialized });
        break;
      }
      case 'LIST_CREDENTIALS_META': {
        const meta = await listCredentialsMeta();
        sendResponse({ ok: true, meta });
        break;
      }
      case 'GET_CREDENTIAL': {
        // Returns a single decrypted credential (vault must be unlocked)
        try {
          const status = await vaultStatus();
          if (!status.unlocked) { sendResponse({ ok: false, error: 'Vault is locked' }); break; }
          const entries = await listCredentials();
          const entry = entries.find(e => e.id === message.credentialId);
          sendResponse({ ok: true, entry: entry || null });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'UNLOCK_AND_FILL': {
        // Unlocks vault with passphrase and returns a specific credential
        try {
          const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
          const settings = await loadSettings();
          await unlockVault(passphrase, settings.vaultTimeout || 15);
          await setBiometricSessionPassphrase(passphrase);
          const entries = await listCredentials();
          // Backfill metadata on unlock
          if (entries.length) syncMetadataFromEntries(entries).catch(() => {});
          const entry = message.credentialId ? entries.find(e => e.id === message.credentialId) : null;
          sendResponse({ ok: true, entry, unlocked: true });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
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
          await setBiometricSessionPassphrase(passphrase);
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
          await setBiometricSessionPassphrase(newPassphrase);
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

      // ─── Biometric / WebAuthn ──────────────────────────────────────────
      case 'BIOMETRIC_STATUS': {
        const enabled = await isBiometricEnabled();
        const data = await getBiometricData();
        sendResponse({ ok: true, enabled, prfAvailable: data?.prfAvailable ?? false });
        break;
      }
      case 'DISABLE_BIOMETRIC': {
        await clearBiometricData();
        await clearBiometricSessionPassphrase();
        sendResponse({ ok: true });
        break;
      }
      case 'BIOMETRIC_REGISTER_COMPLETE': {
        // Called by popup.js after successful credential creation
        const { credentialId, prfOutput, prfAvailable, passphrase } = message;
        try {
          let encryptedPassphrase = null;
          if (prfAvailable && prfOutput && passphrase) {
            encryptedPassphrase = await encryptPassphraseWithPRF(passphrase, prfOutput);
          }
          if (passphrase) {
            await setBiometricSessionPassphrase(passphrase);
          }
          await saveBiometricSetup(credentialId, encryptedPassphrase, prfAvailable);
          sendResponse({ ok: true, prfAvailable });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'BIOMETRIC_AUTH_START': {
        // Opens auth.html in 'authenticate' mode, returns sessionId to content script
        try {
          const biometricData = await getBiometricData();
          if (!biometricData?.enabled) { sendResponse({ ok: false, error: 'Biometrics not enabled' }); break; }

          const tabId = sender.tab?.id;
          const sessionId = crypto.randomUUID();
          const challenge = bufferToBase64(crypto.getRandomValues(new Uint8Array(32)).buffer);

          await chrome.storage.session.set({
            [`biometric_${sessionId}`]: {
              challenge,
              credentialId: biometricData.credentialId,
              requestedCredentialId: message.credentialId,
              tabId,
              mode: 'authenticate',
            },
          });
          sendResponse({ ok: true, sessionId });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'BIOMETRIC_AUTH_COMPLETE': {
        // Called by auth.html after successful authentication assertion
        const { sessionId, prfOutput, prfAvailable } = message;
        try {
          const sRes = await chrome.storage.session.get(`biometric_${sessionId}`);
          const sessionData = sRes[`biometric_${sessionId}`];

          if (!sessionData) { sendResponse({ ok: false, error: 'Session not found' }); break; }
          const { tabId, requestedCredentialId } = sessionData;

          let entry = null;
          let unlockError = null;
          try {
            // 1. Try PRF-based unlock (biometric)
            if (prfAvailable && prfOutput) {
              const biometricData = await getBiometricData();
              if (biometricData?.encryptedPassphrase) {
                const pass = await decryptPassphraseWithPRF(biometricData.encryptedPassphrase, prfOutput);
                await unlockVault(pass);
                await setBiometricSessionPassphrase(pass);
              }
            }

            // 2. Fallback for non-PRF authenticators: unlock using session passphrase
            let status = await vaultStatus();
            if (!status.unlocked) {
              const sessionPassphrase = await getBiometricSessionPassphrase();
              if (sessionPassphrase) {
                await unlockVault(sessionPassphrase);
              }
              status = await vaultStatus();
            }

            // 3. If still locked, prompt manual unlock once to seed session fallback
            if (!status.unlocked) {
              throw new Error('Biometric unlock needs one successful master-password unlock in this browser session.');
            }

            // 4. Retrieve requested credential
            const entries = await listCredentials();
            entry = requestedCredentialId ? entries.find(e => e.id === requestedCredentialId) : null;
          } catch (e) {
            unlockError = e.message;
          }

          // Clean up session
          await chrome.storage.session.remove(`biometric_${sessionId}`);
          // Notify content script
          // Notify content script
          if (tabId) {
            try {
              chrome.tabs.sendMessage(tabId, { type: 'BIOMETRIC_FILL_RESULT', sessionId, entry, error: unlockError });
            } catch {}
          }
          sendResponse({ ok: !unlockError, error: unlockError });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'BIOMETRIC_CANCELLED': {
        const { sessionId, error } = message;
        const sessionKey = `biometric_${sessionId}`;
        
        try {
          const sRes = await chrome.storage.session.get(sessionKey);
          const sd = sRes[sessionKey];
          // Notify content script that auth was cancelled
          if (sd?.tabId) {
            try { chrome.tabs.sendMessage(sd.tabId, { type: 'BIOMETRIC_FILL_RESULT', sessionId, entry: null, error: error || 'Authentication cancelled.' }); } catch {}
          }
          await chrome.storage.session.remove(sessionKey);
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  };

  handler();
  return true;
});

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (pendingSaves.has(notifId)) {
    if (btnIdx === 0) { // Save
      const entry = pendingSaves.get(notifId);
      try {
        await storeCredential(entry);
        chrome.notifications.create(`success_${notifId}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: 'SecurePass',
          message: 'Credential saved successfully!'
        });
      } catch (err) {
        chrome.notifications.create(`error_${notifId}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: 'SecurePass Error',
          message: `Failed to save: ${err.message}`
        });
      }
    }
    pendingSaves.delete(notifId);
    chrome.notifications.clear(notifId);
  }
});

chrome.notifications.onClosed.addListener((notifId) => {
  if (pendingSaves.has(notifId)) {
    pendingSaves.delete(notifId);
  }
});

// --- Clipboard Auto-Clear Logic ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'clearClipboard') {
    await clearClipboardFromBackground();
  } else if (alarm.name === 'vaultAutoLock') {
    try {
      const session = await chrome.storage.session.get('vaultTimeoutMinutes');
      const timeoutSecs = Math.max(60, (session.vaultTimeoutMinutes || 15) * 60);

      chrome.idle.queryState(timeoutSecs, async (state) => {
        if (state === 'locked' || state === 'idle') {
          lockVault();
        } else {
          // User is active, postpone lock!
          await keepAlive();
        }
      });
    } catch {
      lockVault(); // fallback
    }
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

// --- System Idle Auto-Lock ---

chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === 'locked' || newState === 'idle') {
    lockVault();
  }
});
