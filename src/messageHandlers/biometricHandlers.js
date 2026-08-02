/**
 * biometricHandlers.js
 *
 * Handles all WebAuthn / biometric message types:
 *   BIOMETRIC_STATUS, DISABLE_BIOMETRIC, BIOMETRIC_REGISTER_COMPLETE,
 *   BIOMETRIC_AUTH_START, BIOMETRIC_AUTH_COMPLETE, BIOMETRIC_CANCELLED
 */

import {
  getBiometricData, isBiometricEnabled, clearBiometricData, saveBiometricSetup,
  encryptPassphraseWithPRF, decryptPassphraseWithPRF,
  encryptPassphraseWithTrustedDevice, decryptPassphraseWithTrustedDevice,
  clearTrustedDeviceKey, unlockVault, vaultStatus, listCredentials,
} from '../cryptoVault.js';
import { loadSettings } from '../settings.js';
import { bufferToBase64 } from '../encoding.js';
import * as storageUtils from '../utils/storage.js';

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleBiometricStatus(_message, _sender, { sendResponse }) {
  const enabled = await isBiometricEnabled();
  const data = await getBiometricData();
  sendResponse({
    ok: true,
    enabled,
    prfAvailable: data?.prfAvailable ?? false,
    mode: data?.mode || (data?.prfAvailable ? 'prf-unlock' : 'verify-only'),
  });
}

export async function handleDisableBiometric(_message, _sender, { sendResponse, clearBiometricSessionPassphrase }) {
  await clearBiometricData();
  await clearBiometricSessionPassphrase();
  await clearTrustedDeviceKey();
  sendResponse({ ok: true });
}

export async function handleBiometricRegisterComplete(message, _sender, { sendResponse }) {
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
}

export async function handleBiometricAuthStart(message, sender, { sendResponse }) {
  try {
    const biometricData = await getBiometricData();
    if (!biometricData?.enabled) { sendResponse({ ok: false, error: 'Biometrics not enabled' }); return; }

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
}

export async function handleBiometricAuthComplete(message, _sender, { sendResponse, getBiometricSessionPassphrase }) {
  const { sessionId, prfOutput, prfAvailable } = message;
  try {
    const sRes = await storageUtils.getStorage('session', `biometric_${sessionId}`);
    const sessionData = sRes[`biometric_${sessionId}`];

    if (!sessionData) { sendResponse({ ok: false, error: 'Session not found' }); return; }
    const { tabId, requestedCredentialId } = sessionData;

    let entry = null;
    let unlockError = null;
    try {
      const biometricData = await getBiometricData();
      if (!biometricData) throw new Error('Biometric setup not found. Please configure biometric unlock again.');

      const mode = biometricData.mode || (biometricData.prfAvailable ? 'prf-unlock' : 'verify-only');

      if (mode === 'trusted-device') {
        if (!biometricData.encryptedPassphrase) {
          throw new Error('Trusted Device is enabled but not configured correctly. Reconfigure biometric unlock.');
        }
        const trustedPass = await decryptPassphraseWithTrustedDevice(biometricData.encryptedPassphrase);
        await unlockVault(trustedPass);
        const status = await vaultStatus();
        if (!status.unlocked) throw new Error('Trusted Device unlock failed. Please reconfigure biometric setup.');
        const entries = await listCredentials();
        entry = requestedCredentialId ? entries.find(e => e.id === requestedCredentialId) : null;

      } else if (mode === 'verify-only') {
        const sessionPass = await getBiometricSessionPassphrase();
        if (!sessionPass) {
          throw new Error('Biometric verification completed. Enter your master password once to enable quick biometric unlock in this browser session.');
        }
        await unlockVault(sessionPass);
        const status = await vaultStatus();
        if (!status.unlocked) throw new Error('Biometric verification succeeded but the vault is still locked. Enter your master password once and try again.');
        const entries = await listCredentials();
        entry = requestedCredentialId ? entries.find(e => e.id === requestedCredentialId) : null;

      } else {
        // prf-unlock (default)
        if (!prfAvailable || !prfOutput) {
          throw new Error('This authenticator did not return PRF output. Reconfigure biometric unlock on a PRF-capable device.');
        }
        if (!biometricData.encryptedPassphrase) {
          throw new Error('Biometric unlock is not configured correctly. Please set it up again.');
        }
        const pass = await decryptPassphraseWithPRF(biometricData.encryptedPassphrase, prfOutput);
        await unlockVault(pass);
        const status = await vaultStatus();
        if (!status.unlocked) throw new Error('Biometric authentication succeeded, but the vault could not be unlocked. Please set up biometric unlock again.');
        const entries = await listCredentials();
        entry = requestedCredentialId ? entries.find(e => e.id === requestedCredentialId) : null;
      }
    } catch (e) {
      if (e) unlockError = e.message;
    }

    await storageUtils.removeStorage('session', `biometric_${sessionId}`);

    if (tabId) {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'BIOMETRIC_FILL_RESULT', sessionId, entry, error: unlockError });
      } catch {}
    }
    sendResponse({ ok: !unlockError, error: unlockError });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
}

export async function handleBiometricCancelled(message, _sender, { sendResponse }) {
  const { sessionId, error } = message;
  const sessionKey = `biometric_${sessionId}`;
  try {
    const sRes = await storageUtils.getStorage('session', sessionKey);
    const sd = sRes[sessionKey];
    if (sd?.tabId) {
      try {
        chrome.tabs.sendMessage(sd.tabId, {
          type: 'BIOMETRIC_FILL_RESULT', sessionId, entry: null,
          error: error || 'Authentication cancelled.'
        });
      } catch {}
    }
    await storageUtils.removeStorage('session', sessionKey);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}
