import { bufferToBase64, base64ToBuffer } from '../src/encoding.js';
import { getStorage } from '../src/storage.js';

const params    = new URLSearchParams(location.search);
const sessionId = params.get('sessionId');

async function triggerWebAuthn() {
  try {
    const sessionKey = `biometric_${sessionId}`;
    const stored = await getStorage('session', sessionKey);
    const data = stored[sessionKey];
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
        extensions: {
          prf: { eval: { first: new TextEncoder().encode('securepass-master-key-v1') } },
        },
      },
    });

    const prfResults = assertion.getClientExtensionResults()?.prf?.results;
    const prfOutput  = prfResults?.first ? bufferToBase64(prfResults.first) : null;

    await chrome.runtime.sendMessage({
      type: 'BIOMETRIC_AUTH_COMPLETE',
      sessionId,
      prfOutput,
      prfAvailable: !!prfOutput,
    });
  } catch (err) {
    const error = err?.name === 'NotAllowedError' || err?.name === 'AbortError'
      ? 'Authentication cancelled.'
      : (err?.message || 'Biometric authentication failed.');
    chrome.runtime.sendMessage({ type: 'BIOMETRIC_CANCELLED', sessionId, error });
  }
}

triggerWebAuthn();
