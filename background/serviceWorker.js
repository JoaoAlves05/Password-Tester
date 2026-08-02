/**
 * serviceWorker.js — SecurePass Extension Background Service Worker
 *
 * This file is intentionally kept thin. Its only responsibilities are:
 *   1. Build the message-handler router (Map<type, handler>).
 *   2. Run Chrome event listeners (onInstalled, onMessage, alarms, idle, notifications).
 *   3. Manage cross-cutting session state (biometric session passphrase, pendingSaves).
 *
 * All business logic lives in the messageHandlers/ modules.
 */

import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings.js';
import { lockVault, keepAlive, vaultStatus, storeCredential } from '../src/cryptoVault.js';
import { clearTrustedDeviceKey } from '../src/cryptoVault.js';
import { ALARM_NAME, CLIPBOARD_ALARM_NAME, BIOMETRIC_SESSION_PASSPHRASE_KEY } from '../src/constants.js';
import { logger } from '../src/logger.js';
import * as storageUtils from '../src/utils/storage.js';

// ─── Handler modules ───────────────────────────────────────────────────────────
import * as vaultHandlers from '../src/messageHandlers/vaultHandlers.js';
import * as biometricHandlers from '../src/messageHandlers/biometricHandlers.js';
import * as utilHandlers from '../src/messageHandlers/utilHandlers.js';

// ─── Session state ─────────────────────────────────────────────────────────────

/**
 * Stores pending notification → credential pairs so the notification
 * button-click listener can save the credential when the user confirms.
 */
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

// ─── Security guard ────────────────────────────────────────────────────────────

function isExtensionPageSender(sender) {
  return Boolean(sender && sender.id === chrome.runtime.id && !sender.tab);
}

/**
 * Message types that must only be processed when the sender is an extension page
 * (popup, options) — never from a content script or external page.
 */
const EXTENSION_ONLY_TYPES = new Set([
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

// ─── Shared context injected into every handler ────────────────────────────────

function buildContext(sendResponse) {
  return {
    sendResponse,
    pendingSaves,
    vaultStatus,
    setBiometricSessionPassphrase,
    getBiometricSessionPassphrase,
    clearBiometricSessionPassphrase,
    clearTrustedDeviceKey,
  };
}

// ─── Message router ────────────────────────────────────────────────────────────

/**
 * A Map from message.type → async handler function.
 *
 * Each handler receives: (message, sender, context) where context
 * provides session helpers and sendResponse.
 *
 * Adding a new message type is now a one-liner here + a new function
 * in the appropriate handler module — no need to touch the switch block.
 */
const MESSAGE_HANDLERS = new Map([
  // Utility
  ['HIBP_CHECK',               utilHandlers.handleHibpCheck],
  ['GENERATE_PASSWORD',        utilHandlers.handleGeneratePassword],
  ['LOAD_SETTINGS',            utilHandlers.handleLoadSettings],
  ['SAVE_SETTINGS',            utilHandlers.handleSaveSettings],
  ['SET_SYNC_MODE_SAFE',       utilHandlers.handleSetSyncModeSafe],
  ['SCHEDULE_CLIPBOARD_CLEAR', utilHandlers.handleScheduleClipboardClear],
  ['PROMPT_SAVE_CREDENTIAL',   utilHandlers.handlePromptSaveCredential],

  // Vault
  ['INITIALIZE_VAULT',         vaultHandlers.handleInitializeVault],
  ['UNLOCK_VAULT',             vaultHandlers.handleUnlockVault],
  ['LOCK_VAULT',               vaultHandlers.handleLockVault],
  ['VAULT_STATUS',             vaultHandlers.handleVaultStatus],
  ['STORE_CREDENTIAL',         vaultHandlers.handleStoreCredential],
  ['UPDATE_CREDENTIAL',        vaultHandlers.handleUpdateCredential],
  ['DELETE_CREDENTIAL',        vaultHandlers.handleDeleteCredential],
  ['LIST_CREDENTIALS',         vaultHandlers.handleListCredentials],
  ['LIST_CREDENTIALS_META',    vaultHandlers.handleListCredentialsMeta],
  ['GET_CREDENTIAL',           vaultHandlers.handleGetCredential],
  ['UNLOCK_AND_FILL',          vaultHandlers.handleUnlockAndFill],
  ['CHANGE_MASTER_PASSWORD',   vaultHandlers.handleChangeMasterPassword],
  ['EXPORT_VAULT',             vaultHandlers.handleExportVault],
  ['IMPORT_VAULT',             vaultHandlers.handleImportVault],
  ['CLEAR_VAULT_ENTRIES',      vaultHandlers.handleClearVaultEntries],
  ['WIPE_ALL_DATA',            vaultHandlers.handleWipeAllData],
  ['KEEP_ALIVE',               vaultHandlers.handleKeepAlive],

  // Biometric / WebAuthn
  ['BIOMETRIC_STATUS',            biometricHandlers.handleBiometricStatus],
  ['DISABLE_BIOMETRIC',           biometricHandlers.handleDisableBiometric],
  ['BIOMETRIC_REGISTER_COMPLETE', biometricHandlers.handleBiometricRegisterComplete],
  ['BIOMETRIC_AUTH_START',        biometricHandlers.handleBiometricAuthStart],
  ['BIOMETRIC_AUTH_COMPLETE',     biometricHandlers.handleBiometricAuthComplete],
  ['BIOMETRIC_CANCELLED',         biometricHandlers.handleBiometricCancelled],
]);

// ─── Chrome event listeners ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  await saveSettings({ ...DEFAULT_SETTINGS, ...settings });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    // Security: reject sensitive messages from content scripts / external pages.
    if (EXTENSION_ONLY_TYPES.has(message.type) && !isExtensionPageSender(sender)) {
      sendResponse({ ok: false, error: 'Forbidden' });
      return;
    }

    const handler = MESSAGE_HANDLERS.get(message.type);
    if (!handler) {
      sendResponse({ ok: false, error: 'Unknown message type' });
      return;
    }

    await handler(message, sender, buildContext(sendResponse));
  };

  handle();
  return true; // keep the message channel open for async sendResponse
});

// ─── Notifications (pending save) ─────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (pendingSaves.has(notifId)) {
    if (btnIdx === 0) { // "Save" button
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

// ─── Clipboard auto-clear ──────────────────────────────────────────────────────

async function clearClipboardFromBackground() {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ type: 'CLEAR_CLIPBOARD', target: 'offscreen' });
  } catch (error) {
    logger.error('Failed to clear clipboard:', error?.message || String(error));
  }
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: ['offscreen.html']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Clear clipboard after timeout'
  });
}

// ─── Alarms (vault auto-lock + clipboard clear) ────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CLIPBOARD_ALARM_NAME) {
    await clearClipboardFromBackground();
  } else if (alarm.name === ALARM_NAME) {
    try {
      const session = await storageUtils.getStorage('session', 'vaultTimeoutMinutes');
      const timeoutSecs = Math.max(60, (session.vaultTimeoutMinutes || 15) * 60);

      chrome.idle.queryState(timeoutSecs, async (state) => {
        if (state === 'locked' || state === 'idle') {
          lockVault();
        } else {
          // User is active — postpone lock.
          await keepAlive();
        }
      });
    } catch {
      lockVault(); // fallback
    }
  }
});

// ─── System idle auto-lock ─────────────────────────────────────────────────────

chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === 'locked' || newState === 'idle') {
    lockVault();
  }
});
