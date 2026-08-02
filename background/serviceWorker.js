import { checkPassword } from '../src/hibp.js';
import { generatePassword } from '../src/passwordGenerator.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings.js';
import { decryptBackupPayload, encryptBackupPayload, isEncryptedBackupEnvelope } from '../src/backupCrypto.js';
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
  encryptPassphraseWithTrustedDevice,
  decryptPassphraseWithTrustedDevice,
  clearTrustedDeviceKey,
  overwriteVaultEntries,
} from '../src/cryptoVault.js';
import { createVaultBackup, validateString, validateEntry, validateConstraints, validateImportData } from '../src/validation.js';
import { bufferToBase64, base64ToBuffer } from '../src/encoding.js';
import { VAULT_KEY, META_KEY, CHUNK_SIZE, SECUREPASS_DB_NAME, BIOMETRIC_SESSION_PASSPHRASE_KEY, ALARM_NAME } from '../src/constants.js';
import { logger } from '../src/logger.js';
import * as storageUtils from '../src/utils/storage.js';

const pendingSaves = new Map();

async function setBiometricSessionPassphrase(passphrase) {
  if (!passphrase) return;
  await storageUtils.setStorage('session', { [BIOMETRIC_SESSION_PASSPHRASE_KEY]: passphrase });
}

async function getBiometricSessionPassphrase() {
  const result = await storageUtils.getStorage('session', BIOMETRIC_SESSION_PASSPHRASE_KEY);
  return result?.[BIOMETRIC_SESSION_PASSPHRASE_KEY] || '';
}

async function clearBiometricSessionPassphrase() {
  await storageUtils.removeStorage('session', BIOMETRIC_SESSION_PASSPHRASE_KEY);
}

function isExtensionPageSender(sender) {
  return Boolean(sender && sender.id === chrome.runtime.id && !sender.tab);
}

async function deleteIndexedDb(name) {
  return storageUtils.deleteIndexedDb(name);
}

async function clearClipboardAlarmState() {
  try {
    await chrome.alarms.clear('clearClipboard');
  } catch {}
}

async function clearVaultAutoLockAlarmState() {
  try {
    await chrome.alarms.clear(ALARM_NAME);
  } catch {}
}

async function clearAllUserData() {
  pendingSaves.clear();
  await clearBiometricSessionPassphrase();
  await clearTrustedDeviceKey();
  await Promise.allSettled([
    storageUtils.clearStorage('local'),
    storageUtils.clearStorage('sync'),
    storageUtils.clearStorage('session'),
    clearClipboardAlarmState(),
    clearVaultAutoLockAlarmState(),
    deleteIndexedDb(SECUREPASS_DB_NAME),
  ]);
}

async function clearVaultEntriesOnly() {
  await overwriteVaultEntries([]);
  await storageUtils.removeStorage('local', META_KEY);
}

function recordsEqual(recordA, recordB) {
  if (!recordA && !recordB) return true;
  if (!recordA || !recordB) return false;
  return JSON.stringify(recordA) === JSON.stringify(recordB);
}

async function getDB() {
  return storageUtils.getDB();
}

async function readLocalVaultRecordRaw() {
  return storageUtils.readLocalVaultRecordRaw();
}

async function writeLocalVaultRecordRaw(record) {
  return storageUtils.writeLocalVaultRecordRaw(record);
}

async function readSyncVaultRecordRaw() {
  return storageUtils.readSyncVaultRecordRaw();
}

async function writeSyncVaultRecordRaw(record) {
  return storageUtils.writeSyncVaultRecordRaw(record);
}

async function analyzeSyncTransition(targetUseSync) {
  const localRecord = await readLocalVaultRecordRaw();
  const syncRecord = await readSyncVaultRecordRaw();

  const hasLocal = Boolean(localRecord);
  const hasSync = Boolean(syncRecord);
  const equalRecords = recordsEqual(localRecord, syncRecord);

  let requiresResolution = false;
  let defaultStrategy = null;

  if (targetUseSync) {
    if (hasLocal && !hasSync) {
      defaultStrategy = 'copy-local-to-sync';
    } else if (!hasLocal && hasSync) {
      defaultStrategy = 'use-sync';
    } else if (hasLocal && hasSync && !equalRecords) {
      requiresResolution = true;
    }
  } else {
    if (hasSync && !hasLocal) {
      defaultStrategy = 'copy-sync-to-local';
    } else if (!hasSync && hasLocal) {
      defaultStrategy = 'use-local';
    } else if (hasLocal && hasSync && !equalRecords) {
      requiresResolution = true;
    }
  }

  return {
    targetUseSync,
    hasLocal,
    hasSync,
    equalRecords,
    requiresResolution,
    defaultStrategy,
  };
}

async function applySyncTransition(targetUseSync, strategy) {
  const localRecord = await readLocalVaultRecordRaw();
  const syncRecord = await readSyncVaultRecordRaw();
  const hasLocal = Boolean(localRecord);
  const hasSync = Boolean(syncRecord);

  if (targetUseSync) {
    if (strategy === 'keep-local') {
      if (!hasLocal) throw new Error('No local vault data to keep.');
      await writeSyncVaultRecordRaw(localRecord);
    } else if (strategy === 'use-sync') {
      if (!hasSync) throw new Error('No sync vault data available.');
    } else if (strategy === 'copy-local-to-sync') {
      if (!hasLocal) throw new Error('No local vault data to copy.');
      await writeSyncVaultRecordRaw(localRecord);
    }
  } else {
    if (strategy === 'use-sync') {
      if (!hasSync) throw new Error('No sync vault data available.');
      await writeLocalVaultRecordRaw(syncRecord);
    } else if (strategy === 'keep-local') {
      if (!hasLocal) throw new Error('No local vault data to keep.');
    } else if (strategy === 'copy-sync-to-local') {
      if (!hasSync) throw new Error('No sync vault data to copy.');
      await writeLocalVaultRecordRaw(syncRecord);
    }
  }

  const current = await loadSettings();
  await saveSettings({ ...current, useSync: targetUseSync });
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  await saveSettings({ ...DEFAULT_SETTINGS, ...settings });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    const extensionOnlyMessages = new Set([
      'SET_SYNC_MODE_SAFE',
      'SAVE_SETTINGS',
      'STORE_CREDENTIAL',
      'UPDATE_CREDENTIAL',
      'DELETE_CREDENTIAL',
      'INITIALIZE_VAULT',
      'CHANGE_MASTER_PASSWORD',
      'EXPORT_VAULT',
      'IMPORT_VAULT',
      'CLEAR_VAULT_ENTRIES',
      'WIPE_ALL_DATA',
      'DISABLE_BIOMETRIC',
      'BIOMETRIC_REGISTER_COMPLETE',
    ]);

    if (extensionOnlyMessages.has(message.type) && !isExtensionPageSender(sender)) {
      sendResponse({ ok: false, error: 'Forbidden' });
      return;
    }

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
      case 'SET_SYNC_MODE_SAFE': {
        try {
          const targetUseSync = Boolean(message.targetUseSync);
          const strategy = message.strategy || null;
          const analysis = await analyzeSyncTransition(targetUseSync);

          if (analysis.requiresResolution && !strategy) {
            sendResponse({ ok: true, requiresResolution: true, analysis });
            break;
          }

          const selectedStrategy = strategy || analysis.defaultStrategy || null;
          await applySyncTransition(targetUseSync, selectedStrategy);
          const settings = await loadSettings();
          sendResponse({ ok: true, requiresResolution: false, applied: true, settings });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
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
          const backup = createVaultBackup(entries);
          const format = message?.format === 'plaintext' ? 'plaintext' : 'encrypted';

          if (format === 'plaintext') {
            sendResponse({ ok: true, data: backup, encrypted: false });
            return;
          }

          const backupPassword = validateString(message.backupPassword, 1024, 'backupPassword', true);
          const encryptedBackup = await encryptBackupPayload(backup, backupPassword);
          sendResponse({ ok: true, data: encryptedBackup, encrypted: true });
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

          const passphrase = message.passphrase ? validateString(message.passphrase, 1024, 'passphrase', true) : '';

          let importSource = message.data;
          if (isEncryptedBackupEnvelope(importSource)) {
            const backupPassword = validateString(message.backupPassword, 1024, 'backupPassword', true);
            importSource = await decryptBackupPayload(importSource, backupPassword);
          }

          const cleanData = validateImportData(importSource);
          
          const count = await importVaultData(cleanData, passphrase || undefined);
          sendResponse({ ok: true, count });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'CLEAR_VAULT_ENTRIES': {
        try {
          const status = await vaultStatus();
          if (!status.unlocked) {
            sendResponse({ ok: false, error: 'Vault is locked' });
            return;
          }

          await clearVaultEntriesOnly();
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
      }
      case 'WIPE_ALL_DATA': {
        try {
          await lockVault();
          await clearAllUserData();
          sendResponse({ ok: true });
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
        sendResponse({
          ok: true,
          enabled,
          prfAvailable: data?.prfAvailable ?? false,
          mode: data?.mode || (data?.prfAvailable ? 'prf-unlock' : 'verify-only'),
        });
        break;
      }
      case 'DISABLE_BIOMETRIC': {
        await clearBiometricData();
        await clearBiometricSessionPassphrase();
        await clearTrustedDeviceKey();
        sendResponse({ ok: true });
        break;
      }
      case 'BIOMETRIC_REGISTER_COMPLETE': {
        // Called by popup.js after successful credential creation
        const { credentialId, prfOutput, prfAvailable, passphrase, trustedDeviceRequested } = message;
        try {
          const settings = await loadSettings();
          const trustedRequested = Boolean(trustedDeviceRequested ?? settings?.trustedDeviceMode);
          const hasPRF = Boolean(prfAvailable && prfOutput);
          let mode = 'verify-only';
          let encryptedPassphrase = null;

          if (hasPRF && passphrase) {
            encryptedPassphrase = await encryptPassphraseWithPRF(passphrase, prfOutput);
            mode = 'prf-unlock';
          } else if (trustedRequested && passphrase) {
            encryptedPassphrase = await encryptPassphraseWithTrustedDevice(passphrase);
            mode = 'trusted-device';
          }

          await saveBiometricSetup(credentialId, encryptedPassphrase, hasPRF, mode);
          sendResponse({ ok: true, prfAvailable: hasPRF, mode });
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

          await storageUtils.setStorage('session', {
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
          const sRes = await storageUtils.getStorage('session', `biometric_${sessionId}`);
          const sessionData = sRes[`biometric_${sessionId}`];

          if (!sessionData) { sendResponse({ ok: false, error: 'Session not found' }); break; }
          const { tabId, requestedCredentialId } = sessionData;

          let entry = null;
          let unlockError = null;
          try {
            const biometricData = await getBiometricData();
            if (!biometricData) {
              throw new Error('Biometric setup not found. Please configure biometric unlock again.');
            }

            const mode = biometricData.mode || (biometricData.prfAvailable ? 'prf-unlock' : 'verify-only');
            if (mode !== 'prf-unlock') {
              if (mode === 'trusted-device') {
                if (!biometricData.encryptedPassphrase) {
                  throw new Error('Trusted Device is enabled but not configured correctly. Reconfigure biometric unlock.');
                }
                const trustedPass = await decryptPassphraseWithTrustedDevice(biometricData.encryptedPassphrase);
                await unlockVault(trustedPass);
                const trustedStatus = await vaultStatus();
                if (!trustedStatus.unlocked) {
                  throw new Error('Trusted Device unlock failed. Please reconfigure biometric setup.');
                }
                const trustedEntries = await listCredentials();
                entry = requestedCredentialId ? trustedEntries.find(e => e.id === requestedCredentialId) : null;
              } else {
                const sessionPass = await getBiometricSessionPassphrase();
                if (!sessionPass) {
                  throw new Error('Biometric verification completed. Enter your master password once to enable quick biometric unlock in this browser session.');
                }

                await unlockVault(sessionPass);
                const verifyOnlyStatus = await vaultStatus();
                if (!verifyOnlyStatus.unlocked) {
                  throw new Error('Biometric verification succeeded but the vault is still locked. Enter your master password once and try again.');
                }

                const verifyOnlyEntries = await listCredentials();
                entry = requestedCredentialId ? verifyOnlyEntries.find(e => e.id === requestedCredentialId) : null;
              }
            } else {
              if (!prfAvailable || !prfOutput) {
                throw new Error('This authenticator did not return PRF output. Reconfigure biometric unlock on a PRF-capable device.');
              }

              if (!biometricData.encryptedPassphrase) {
                throw new Error('Biometric unlock is not configured correctly. Please set it up again.');
              }

              const pass = await decryptPassphraseWithPRF(biometricData.encryptedPassphrase, prfOutput);
              await unlockVault(pass);

              const status = await vaultStatus();
              if (!status.unlocked) {
                throw new Error('Biometric authentication succeeded, but the vault could not be unlocked. Please set up biometric unlock again.');
              }

              // 2. Retrieve requested credential
              const entries = await listCredentials();
              entry = requestedCredentialId ? entries.find(e => e.id === requestedCredentialId) : null;
            }
          } catch (e) {
            if (e) {
              unlockError = e.message;
            }
          }

          // Clean up session
          await storageUtils.removeStorage('session', `biometric_${sessionId}`);
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
          const sRes = await storageUtils.getStorage('session', sessionKey);
          const sd = sRes[sessionKey];
          // Notify content script that auth was cancelled
          if (sd?.tabId) {
            try { chrome.tabs.sendMessage(sd.tabId, { type: 'BIOMETRIC_FILL_RESULT', sessionId, entry: null, error: error || 'Authentication cancelled.' }); } catch {}
          }
          await storageUtils.removeStorage('session', sessionKey);
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
  } else if (alarm.name === ALARM_NAME) {
    try {
      const session = await storageUtils.getStorage('session', 'vaultTimeoutMinutes');
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
    logger.error('Failed to clear clipboard:', error?.message || String(error));
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
