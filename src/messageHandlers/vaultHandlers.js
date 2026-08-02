/**
 * vaultHandlers.js
 *
 * Handles all vault-related message types:
 *   INITIALIZE_VAULT, UNLOCK_VAULT, LOCK_VAULT, VAULT_STATUS,
 *   STORE_CREDENTIAL, UPDATE_CREDENTIAL, DELETE_CREDENTIAL,
 *   LIST_CREDENTIALS, LIST_CREDENTIALS_META, GET_CREDENTIAL,
 *   UNLOCK_AND_FILL, CHANGE_MASTER_PASSWORD, EXPORT_VAULT,
 *   IMPORT_VAULT, CLEAR_VAULT_ENTRIES, WIPE_ALL_DATA, KEEP_ALIVE
 */

import {
  initializeVault, unlockVault, lockVault, vaultStatus,
  storeCredential, updateCredential, deleteCredential,
  listCredentials, listCredentialsMeta, changeMasterPassword,
  importVaultData, keepAlive, syncMetadataFromEntries,
  overwriteVaultEntries,
} from '../cryptoVault.js';
import { createVaultBackup, validateString, validateEntry, validateImportData } from '../validation.js';
import { decryptBackupPayload, encryptBackupPayload, isEncryptedBackupEnvelope } from '../backupCrypto.js';
import { loadSettings } from '../settings.js';
import { META_KEY, SECUREPASS_DB_NAME } from '../constants.js';
import * as storageUtils from '../utils/storage.js';

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleInitializeVault(message, _sender, { sendResponse, setBiometricSessionPassphrase }) {
  try {
    const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
    const created = await initializeVault(passphrase);
    await setBiometricSessionPassphrase(passphrase);
    sendResponse({ ok: true, created });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleUnlockVault(message, _sender, { sendResponse, setBiometricSessionPassphrase }) {
  try {
    const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
    await initializeVault(passphrase);
    const data = await unlockVault(passphrase, message.timeoutMinutes);
    await setBiometricSessionPassphrase(passphrase);
    sendResponse({ ok: true, data });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleLockVault(_message, _sender, { sendResponse }) {
  lockVault();
  sendResponse({ ok: true });
}

export async function handleVaultStatus(_message, _sender, { sendResponse }) {
  const status = await vaultStatus();
  sendResponse({ ok: true, status });
}

export async function handleStoreCredential(message, _sender, { sendResponse }) {
  try {
    const entry = validateEntry(message.entry);
    if (!entry.password) throw new Error('Password is required');
    const passphrase = validateString(message.passphrase, 1024, 'passphrase', false);
    const stored = await storeCredential(entry, passphrase);
    sendResponse({ ok: true, entry: stored });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleUpdateCredential(message, _sender, { sendResponse }) {
  try {
    const id = validateString(message.id, 64, 'id', true);
    const updates = validateEntry(message.updates, true);
    const passphrase = validateString(message.passphrase, 1024, 'passphrase', false);
    const entry = await updateCredential(id, updates, passphrase);
    sendResponse({ ok: true, entry });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleDeleteCredential(message, _sender, { sendResponse }) {
  try {
    const id = validateString(message.id, 64, 'id', true);
    const passphrase = validateString(message.passphrase, 1024, 'passphrase', false);
    await deleteCredential(id, passphrase);
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleListCredentials(_message, _sender, { sendResponse }) {
  const status = await vaultStatus();
  const entries = await listCredentials();
  if (status.unlocked && entries.length) {
    syncMetadataFromEntries(entries).catch(() => {});
  }
  sendResponse({ ok: true, entries, unlocked: status.unlocked, initialized: status.initialized });
}

export async function handleListCredentialsMeta(_message, _sender, { sendResponse }) {
  const meta = await listCredentialsMeta();
  sendResponse({ ok: true, meta });
}

export async function handleGetCredential(message, _sender, { sendResponse }) {
  try {
    const status = await vaultStatus();
    if (!status.unlocked) { sendResponse({ ok: false, error: 'Vault is locked' }); return; }
    const entries = await listCredentials();
    const entry = entries.find(e => e.id === message.credentialId);
    sendResponse({ ok: true, entry: entry || null });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleUnlockAndFill(message, _sender, { sendResponse, setBiometricSessionPassphrase }) {
  try {
    const passphrase = validateString(message.passphrase, 1024, 'passphrase', true);
    const settings = await loadSettings();
    await unlockVault(passphrase, settings.vaultTimeout || 15);
    await setBiometricSessionPassphrase(passphrase);
    const entries = await listCredentials();
    if (entries.length) syncMetadataFromEntries(entries).catch(() => {});
    const entry = message.credentialId ? entries.find(e => e.id === message.credentialId) : null;
    sendResponse({ ok: true, entry, unlocked: true });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleChangeMasterPassword(message, _sender, { sendResponse, setBiometricSessionPassphrase }) {
  try {
    const oldPassphrase = validateString(message.oldPassphrase, 1024, 'oldPassphrase', true);
    const newPassphrase = validateString(message.newPassphrase, 1024, 'newPassphrase', true);
    await changeMasterPassword(oldPassphrase, newPassphrase);
    await setBiometricSessionPassphrase(newPassphrase);
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleExportVault(message, _sender, { sendResponse }) {
  try {
    const status = await vaultStatus();
    if (!status.unlocked) { sendResponse({ ok: false, error: 'Vault is locked' }); return; }

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
}

export async function handleImportVault(message, _sender, { sendResponse }) {
  try {
    const status = await vaultStatus();
    if (!status.unlocked) { sendResponse({ ok: false, error: 'Vault is locked' }); return; }

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
}

export async function handleClearVaultEntries(_message, _sender, { sendResponse }) {
  try {
    const status = await vaultStatus();
    if (!status.unlocked) { sendResponse({ ok: false, error: 'Vault is locked' }); return; }
    await overwriteVaultEntries([]);
    await storageUtils.removeStorage('local', META_KEY);
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleWipeAllData(
  _message, _sender,
  { sendResponse, clearBiometricSessionPassphrase, clearTrustedDeviceKey, pendingSaves }
) {
  try {
    await lockVault();
    pendingSaves.clear();
    await clearBiometricSessionPassphrase();
    await clearTrustedDeviceKey();
    await Promise.allSettled([
      storageUtils.clearStorage('local'),
      storageUtils.clearStorage('sync'),
      storageUtils.clearStorage('session'),
      storageUtils.deleteIndexedDb(SECUREPASS_DB_NAME),
    ]);
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleKeepAlive(_message, _sender, { sendResponse }) {
  try {
    const alive = await keepAlive();
    sendResponse({ ok: true, alive });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}
