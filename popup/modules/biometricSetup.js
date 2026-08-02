import { state, resetInactivityTimer } from '../popup.js';
import { sendMessage } from './messaging.js';
import { showToast } from './toast.js';
import { renderVaultState } from '../popup.js';
import { renderEntries } from './vault.js';
import { base64ToBuffer, bufferToBase64 } from '../../src/encoding.js';

export function attachBiometricListeners() {
  const biometricUnlockBtn = document.getElementById('biometricUnlockBtn');
  const biometricSetupBtn = document.getElementById('biometricSetupBtn');
  const biometricInlineAuth = document.getElementById('biometricInlineAuth');
  const biometricInlinePassword = document.getElementById('biometricInlinePassword');
  const biometricInlineCancel = document.getElementById('biometricInlineCancel');
  const biometricInlineConfirm = document.getElementById('biometricInlineConfirm');

  if (biometricUnlockBtn) {
    biometricUnlockBtn.addEventListener('click', async () => {
      if (!state.vaultInitialized) {
        showToast('Initialize the vault first before enabling biometrics.', 'warning');
        return;
      }
      const status = await sendMessage('BIOMETRIC_STATUS');
      if (!status?.ok || !status.enabled) {
        showToast('Biometric unlock is not configured yet.', 'info');
        return;
      }
      try {
        const startRes = await sendMessage('BIOMETRIC_AUTH_START', { credentialId: null });
        if (!startRes?.ok) {
          showToast('Failed to start biometric auth.', 'error');
          return;
        }
        const sessionId = startRes.sessionId;
        const stored = await chrome.storage.session.get(`biometric_${sessionId}`);
        const data = stored[`biometric_${sessionId}`];
        if (!data) throw new Error('Invalid session');
        const challenge = base64ToBuffer(data.challenge);
        const rpId = chrome.runtime.id;
        const allowCreds = data.credentialId
          ? [{ type: 'public-key', id: base64ToBuffer(data.credentialId), transports: ['internal'] }]
          : [];
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId,
            allowCredentials: allowCreds,
            userVerification: 'required',
            extensions: { prf: { eval: { first: new TextEncoder().encode('securepass-master-key-v1') } } },
          },
        });
        const prfResults = assertion.getClientExtensionResults()?.prf?.results;
        const prfOutput  = prfResults?.first ? bufferToBase64(prfResults.first) : null;
        const completeRes = await sendMessage('BIOMETRIC_AUTH_COMPLETE', {
          sessionId, prfOutput, prfAvailable: !!prfOutput,
        });
        if (completeRes?.ok) {
           const statusRes = await sendMessage('VAULT_STATUS');
           if (statusRes?.status?.unlocked) {
             state.vaultUnlocked = true;
             const entriesRes = await sendMessage('LIST_CREDENTIALS');
             state.entries = entriesRes?.ok ? entriesRes.data : [];
             renderVaultState();
             renderEntries();
             resetInactivityTimer();
             showToast('Vault unlocked.', 'success');
           }
        } else {
           showToast(completeRes?.error || 'Authentication failed.', 'error');
        }
      } catch (err) {
        showToast(err.name === 'NotAllowedError' ? 'Authentication cancelled.' : 'Authentication failed.', 'error');
      }
    });
  }

  if (biometricSetupBtn) {
    biometricSetupBtn.addEventListener('click', (e) => {
      if (!e.target.closest('.biometric-inline-auth')) {
        const isOpen = biometricSetupBtn.classList.contains('inline-auth-open');
        if (isOpen) {
          biometricSetupBtn.classList.remove('inline-auth-open');
          biometricInlineAuth?.setAttribute('aria-hidden', 'true');
        } else {
          biometricSetupBtn.classList.add('inline-auth-open');
          biometricInlineAuth?.setAttribute('aria-hidden', 'false');
          if (biometricInlinePassword) biometricInlinePassword.focus();
        }
      }
    });
  }

  if (biometricInlineCancel) {
    biometricInlineCancel.addEventListener('click', () => {
      biometricSetupBtn?.classList.remove('inline-auth-open');
      biometricInlineAuth?.setAttribute('aria-hidden', 'true');
      if (biometricInlinePassword) biometricInlinePassword.value = '';
    });
  }

  if (biometricInlineConfirm) {
    biometricInlineConfirm.addEventListener('click', async () => {
      const passphrase = (biometricInlinePassword?.value || '').trim();
      if (!passphrase) {
        showToast('Enter your master password to continue.', 'warning');
        return;
      }
      const timeoutMinutes = state.settings?.vaultTimeout || 15;
      const response = await sendMessage('UNLOCK_VAULT', { passphrase, timeoutMinutes });
      if (!response?.ok) {
        showToast(response?.error || 'Invalid master password.', 'error');
        return;
      }
      try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const rpId = chrome.runtime.id;
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { id: rpId, name: 'SecurePass' },
            user: {
              id: new TextEncoder().encode('securepass-user'),
              name: 'SecurePass User',
              displayName: 'SecurePass',
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            extensions: {
              prf: { eval: { first: new TextEncoder().encode('securepass-master-key-v1') } },
            },
          },
        });

        const prfResults = credential.getClientExtensionResults()?.prf?.results;
        const prfOutput  = prfResults?.first ? bufferToBase64(prfResults.first) : null;

        const regRes = await sendMessage('BIOMETRIC_REGISTER_COMPLETE', {
          credentialId: bufferToBase64(credential.rawId),
          prfOutput,
          prfAvailable: !!prfOutput,
          passphrase
        });

        if (regRes?.ok) {
          showToast('Biometric setup complete!', 'success');
        } else {
          showToast(regRes?.error || 'Failed to setup biometrics.', 'error');
        }
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showToast('Biometric setup cancelled.', 'info');
        } else {
          showToast('Error: ' + err.message, 'error');
        }
      }

      biometricSetupBtn?.classList.remove('inline-auth-open');
      biometricInlineAuth?.setAttribute('aria-hidden', 'true');
      if (biometricInlinePassword) biometricInlinePassword.value = '';
    });
  }
}
