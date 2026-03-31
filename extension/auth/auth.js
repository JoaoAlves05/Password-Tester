function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const params  = new URLSearchParams(location.search);
const sessionId = params.get('sessionId');
const mode      = params.get('mode'); // 'register' | 'authenticate'

const authBtn  = document.getElementById('auth-btn');
const btnText  = document.getElementById('auth-btn-text');
const spinner  = document.getElementById('spinner');
const errorMsg = document.getElementById('error-msg');
const cancelBtn = document.getElementById('cancel-btn');
const title    = document.getElementById('title');
const subtitle = document.getElementById('subtitle');

if (mode === 'register') {
  title.textContent = 'Configura a biometria';
  subtitle.textContent = 'Regista a tua biometria ou PIN para desbloquear o SecurePass sem password.';
  btnText.textContent = 'Registar';
}

function setLoading(loading) {
  authBtn.disabled = loading;
  spinner.style.display = loading ? 'block' : 'none';
  if (loading) btnText.textContent = mode === 'register' ? 'A registar…' : 'A autenticar…';
  else         btnText.textContent = mode === 'register' ? 'Registar' : 'Autorizar';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

cancelBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'BIOMETRIC_CANCELLED', sessionId });
  window.close();
});

authBtn.addEventListener('click', () => triggerWebAuthn());

// Auto-trigger for better UX
window.addEventListener('load', () => setTimeout(() => triggerWebAuthn(), 300));

async function triggerWebAuthn() {
  setLoading(true);
  errorMsg.style.display = 'none';
  try {
    const sessionKey = `biometric_${sessionId}`;
    const stored = await chrome.storage.session.get(sessionKey);
    const data = stored[sessionKey];
    if (!data) { showError('Sessão inválida. Fecha e tenta novamente.'); setLoading(false); return; }

    const challenge = base64ToBuffer(data.challenge);
    const rpId = chrome.runtime.id;

    if (mode === 'register') {
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

      await chrome.runtime.sendMessage({
        type: 'BIOMETRIC_REGISTER_COMPLETE',
        sessionId,
        credentialId: bufferToBase64(credential.rawId),
        prfOutput,
        prfAvailable: !!prfOutput,
      });

    } else {
      // authenticate
      const allowCreds = data.credentialId
        ? [{ type: 'public-key', id: base64ToBuffer(data.credentialId) }]
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
    }

    window.close();
  } catch (err) {
    setLoading(false);
    if (err.name === 'NotAllowedError') {
      showError('Operação cancelada ou não permitida. Tenta novamente.');
    } else {
      showError(err.message || 'Erro desconhecido durante a autenticação.');
    }
  }
}
