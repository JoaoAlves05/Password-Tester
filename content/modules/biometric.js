// Local fallback implementations of encoding functions in case dynamic import fails.
let bufferToBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

let base64ToBuffer = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

// Try to use centralized encoding helpers
(async () => {
  try {
    const enc = await import(chrome.runtime.getURL('src/encoding.js'));
    if (enc?.bufferToBase64) bufferToBase64 = enc.bufferToBase64;
    if (enc?.base64ToBuffer) base64ToBuffer = enc.base64ToBuffer;
  } catch (e) {}
})();

export async function runBiometricAssertion(credentialId, sessionId) {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: chrome.runtime.id,
        allowCredentials: credentialId ? [{
          type: 'public-key',
          id: base64ToBuffer(credentialId),
          transports: ['internal']
        }] : [],
        userVerification: 'required',
        extensions: {
          prf: { eval: { first: new TextEncoder().encode('securepass-master-key-v1') } },
        },
      },
    });

    const prfResults = assertion.getClientExtensionResults()?.prf?.results;
    const prfOutput = prfResults?.first ? bufferToBase64(prfResults.first) : null;

    return await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'BIOMETRIC_AUTH_COMPLETE',
        sessionId,
        prfOutput,
        prfAvailable: !!prfOutput
      }, resolve);
    });
  } catch (error) {
    const errorMessage = error?.name === 'NotAllowedError' || error?.name === 'AbortError'
      ? 'Authentication cancelled.'
      : (error?.message || 'Biometric authentication failed.');
    await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'BIOMETRIC_CANCELLED', sessionId, error: errorMessage }, resolve);
    });
    throw error;
  }
}

export async function tryBiometricUnlock(credentialId) {
  const status = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'BIOMETRIC_STATUS' }, resolve);
  });

  if (!status?.ok || !status.enabled) {
    return false;
  }

  const startRes = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'BIOMETRIC_AUTH_START', credentialId }, resolve);
  });

  if (!startRes?.ok) {
    return false;
  }

  const sessionId = startRes.sessionId;
  const authIframe = document.createElement('iframe');
  authIframe.className = 'securepass-auth-iframe';
  authIframe.src = chrome.runtime.getURL(`auth/auth.html?sessionId=${sessionId}&mode=authenticate`);
  authIframe.style.cssText = 'width:0;height:0;border:none;position:absolute;';
  authIframe.allow = 'publickey-credentials-get *';
  document.documentElement.appendChild(authIframe);

  try {
    const result = await new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        resolve({ ok: false, error: 'Biometric authentication timed out.' });
      }, 30000);

      const listener = (msg) => {
        if (msg.type !== 'BIOMETRIC_FILL_RESULT') return;
        if (msg.sessionId !== sessionId) return;
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        if (msg.entry) {
          resolve({ ok: true, entry: msg.entry });
        } else {
          resolve({ ok: false, error: msg.error || 'Authentication failed.' });
        }
      };

      chrome.runtime.onMessage.addListener(listener);
    });

    return result;
  } finally {
    authIframe.remove();
  }
}
