/**
 * utilHandlers.js
 *
 * Handles lightweight, utility-level message types:
 *   HIBP_CHECK, GENERATE_PASSWORD, LOAD_SETTINGS, SAVE_SETTINGS,
 *   SET_SYNC_MODE_SAFE, SCHEDULE_CLIPBOARD_CLEAR, PROMPT_SAVE_CREDENTIAL
 *
 * Each export is an async function with the signature:
 *   (message, sender, { sendResponse, deps }) => Promise<void>
 *
 * Dependencies are injected by the serviceWorker router so this module
 * remains pure and independently testable.
 */

import { checkPassword } from '../hibp.js';
import { generatePassword } from '../passwordGenerator.js';
import { loadSettings, saveSettings } from '../settings.js';
import { validateString, validateConstraints } from '../validation.js';
import { CLIPBOARD_ALARM_NAME } from '../constants.js';
import * as storageUtils from '../utils/storage.js';

// ─── Sync-mode transition helpers ─────────────────────────────────────────────

function recordsEqual(recordA, recordB) {
  if (!recordA && !recordB) return true;
  if (!recordA || !recordB) return false;
  return JSON.stringify(recordA) === JSON.stringify(recordB);
}

async function analyzeSyncTransition(targetUseSync) {
  const localRecord = await storageUtils.readLocalVaultRecordRaw();
  const syncRecord = await storageUtils.readSyncVaultRecordRaw();

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

  return { targetUseSync, hasLocal, hasSync, equalRecords, requiresResolution, defaultStrategy };
}

async function applySyncTransition(targetUseSync, strategy) {
  const localRecord = await storageUtils.readLocalVaultRecordRaw();
  const syncRecord = await storageUtils.readSyncVaultRecordRaw();
  const hasLocal = Boolean(localRecord);
  const hasSync = Boolean(syncRecord);

  if (targetUseSync) {
    if (strategy === 'keep-local') {
      if (!hasLocal) throw new Error('No local vault data to keep.');
      await storageUtils.writeSyncVaultRecordRaw(localRecord);
    } else if (strategy === 'use-sync') {
      if (!hasSync) throw new Error('No sync vault data available.');
    } else if (strategy === 'copy-local-to-sync') {
      if (!hasLocal) throw new Error('No local vault data to copy.');
      await storageUtils.writeSyncVaultRecordRaw(localRecord);
    }
  } else {
    if (strategy === 'use-sync') {
      if (!hasSync) throw new Error('No sync vault data available.');
      await storageUtils.writeLocalVaultRecordRaw(syncRecord);
    } else if (strategy === 'keep-local') {
      if (!hasLocal) throw new Error('No local vault data to keep.');
    } else if (strategy === 'copy-sync-to-local') {
      if (!hasSync) throw new Error('No sync vault data to copy.');
      await storageUtils.writeLocalVaultRecordRaw(syncRecord);
    }
  }

  const current = await loadSettings();
  await saveSettings({ ...current, useSync: targetUseSync });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleHibpCheck(message, _sender, { sendResponse }) {
  try {
    const password = validateString(message.password, 1024, 'password', true);
    const result = await checkPassword(password);
    sendResponse({ ok: true, result });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleGeneratePassword(message, _sender, { sendResponse }) {
  try {
    const constraints = validateConstraints(message.constraints);
    const generated = await generatePassword(constraints);
    sendResponse({ ok: true, password: generated });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleLoadSettings(_message, _sender, { sendResponse }) {
  const settings = await loadSettings();
  sendResponse({ ok: true, settings });
}

export async function handleSaveSettings(message, _sender, { sendResponse }) {
  await saveSettings(message.settings);
  sendResponse({ ok: true });
}

export async function handleSetSyncModeSafe(message, _sender, { sendResponse }) {
  try {
    const targetUseSync = Boolean(message.targetUseSync);
    const strategy = message.strategy || null;
    const analysis = await analyzeSyncTransition(targetUseSync);

    if (analysis.requiresResolution && !strategy) {
      sendResponse({ ok: true, requiresResolution: true, analysis });
      return;
    }

    const selectedStrategy = strategy || analysis.defaultStrategy || null;
    await applySyncTransition(targetUseSync, selectedStrategy);
    const settings = await loadSettings();
    sendResponse({ ok: true, requiresResolution: false, applied: true, settings });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleScheduleClipboardClear(message, _sender, { sendResponse }) {
  const { timeout } = message;
  if (timeout > 0) {
    await chrome.alarms.create(CLIPBOARD_ALARM_NAME, { delayInMinutes: timeout / 60 });
  }
  sendResponse({ ok: true });
}

/**
 * Called by the content script to prompt the user to save a detected credential.
 * The actual save is handled by the notifications button-click listener in serviceWorker.js.
 */
export async function handlePromptSaveCredential(message, _sender, { sendResponse, pendingSaves, vaultStatus }) {
  const { entry, origin } = message;
  const status = await vaultStatus();
  if (!status.unlocked) {
    sendResponse({ ok: false, error: 'Vault is locked' });
    return;
  }

  const notifId = `save_cred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'SecurePass - Save Credential?',
    message: `Do you want to save the new password for ${entry.username || 'this account'} on ${origin}?`,
    buttons: [{ title: 'Save' }, { title: 'Ignore' }],
    priority: 2
  });

  pendingSaves.set(notifId, entry);
  sendResponse({ ok: true });
}
