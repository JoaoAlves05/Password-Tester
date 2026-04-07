(async () => {
  const AUTO_SUBMIT_ENABLED = true;

  function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function runBiometricAssertion(credentialId, sessionId) {
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

  async function tryBiometricUnlock(credentialId) {
    const status = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'BIOMETRIC_STATUS' }, response => {
        resolve(response);
      });
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

  const shadowHost = document.createElement('div');
  shadowHost.id = 'securepass-extension-root';
  shadowHost.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483647; overflow: visible;';
  document.body.appendChild(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { font-size: 16px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ═══ Theme variables ═══ */
    .sp-dark {
      --sp-bg: rgba(15, 23, 42, 0.94);
      --sp-bg-solid: #0f172a;
      --sp-surface: rgba(255,255,255,0.06);
      --sp-surface-hover: rgba(255,255,255,0.12);
      --sp-border: rgba(255,255,255,0.10);
      --sp-border-hover: rgba(255,255,255,0.22);
      --sp-text: #f8fafc;
      --sp-text-secondary: #94a3b8;
      --sp-text-muted: #64748b;
      --sp-accent: #3b82f6;
      --sp-accent-bg: rgba(37,99,235,0.85);
      --sp-accent-glow: rgba(37,99,235,0.4);
      --sp-accent-subtle: rgba(37,99,235,0.12);
      --sp-danger: #f87171;
      --sp-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--sp-border);
      --sp-stub-bg: rgba(37,99,235,0.08);
      --sp-stub-border: rgba(37,99,235,0.2);
      --sp-overlay-bg: rgba(10,18,35,0.97);
      --sp-input-bg: rgba(255,255,255,0.06);
      --sp-input-border: rgba(255,255,255,0.12);
      --sp-divider: rgba(255,255,255,0.08);
      --sp-settings-bg: rgba(0,0,0,0.25);
    }
    .sp-light {
      --sp-bg: rgba(255, 255, 255, 0.96);
      --sp-bg-solid: #ffffff;
      --sp-surface: rgba(0,0,0,0.04);
      --sp-surface-hover: rgba(0,0,0,0.08);
      --sp-border: rgba(0,0,0,0.10);
      --sp-border-hover: rgba(0,0,0,0.20);
      --sp-text: #0f172a;
      --sp-text-secondary: #475569;
      --sp-text-muted: #94a3b8;
      --sp-accent: #2563eb;
      --sp-accent-bg: rgba(37,99,235,0.9);
      --sp-accent-glow: rgba(37,99,235,0.25);
      --sp-accent-subtle: rgba(37,99,235,0.08);
      --sp-danger: #ef4444;
      --sp-shadow: 0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px var(--sp-border);
      --sp-stub-bg: rgba(37,99,235,0.06);
      --sp-stub-border: rgba(37,99,235,0.15);
      --sp-overlay-bg: rgba(255,255,255,0.97);
      --sp-input-bg: rgba(0,0,0,0.03);
      --sp-input-border: rgba(0,0,0,0.12);
      --sp-divider: rgba(0,0,0,0.07);
      --sp-settings-bg: rgba(0,0,0,0.04);
    }

    /* ═══ Floating Button ═══ */
    .securepass-floating {
      pointer-events: auto;
      position: fixed;
      z-index: 2147483646;
      width: 26px;
      height: 26px;
      border-radius: 8px;
      border: none;
      background: var(--sp-accent-subtle, rgba(37,99,235,0.12));
      opacity: 0.55;
      backdrop-filter: blur(4px);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
    }
    .securepass-floating:hover, .securepass-floating--focused, .securepass-floating--active {
      opacity: 1;
      background: var(--sp-accent-bg, rgba(37,99,235,0.85));
      box-shadow: 0 0 0 2px var(--sp-accent-glow, rgba(59,130,246,0.4));
    }
    .securepass-floating svg {
      width: 13px;
      height: 13px;
      color: var(--sp-accent, #3b82f6);
      transition: color 0.2s ease;
    }
    .securepass-floating:hover svg, .securepass-floating--focused svg, .securepass-floating--active svg {
      color: #ffffff;
    }

    /* ═══ Panel Container ═══ */
    .securepass-panel {
      pointer-events: auto;
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      max-height: 460px;
      overflow-y: auto;
      overflow-x: hidden;
      border-radius: 14px;
      padding: 14px;
      background: var(--sp-bg);
      color: var(--sp-text);
      box-shadow: var(--sp-shadow);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 0.8rem;
      line-height: 1.45;
      animation: securepass-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: top center;
    }
    .securepass-panel::-webkit-scrollbar { width: 4px; }
    .securepass-panel::-webkit-scrollbar-thumb { background: var(--sp-border); border-radius: 4px; }
    @keyframes securepass-slide-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Header */
    .securepass-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      cursor: grab;
      user-select: none;
    }
    .securepass-panel-header:active {
      cursor: grabbing;
    }
    .securepass-panel h3 {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--sp-text);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .securepass-panel .context-badge {
      font-size: 0.6rem;
      background: var(--sp-surface);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--sp-text-secondary);
    }

    /* Meter */
    .securepass-meter {
      height: 5px;
      border-radius: 999px;
      background: var(--sp-surface);
      overflow: hidden;
      margin-bottom: 5px;
    }
    .securepass-meter div {
      height: 100%;
      width: 6%;
      border-radius: inherit;
      background: #ef4444;
      transition: width 0.3s ease, background 0.3s ease;
    }
    .securepass-meta {
      font-size: 0.72rem;
      display: flex;
      justify-content: space-between;
      color: var(--sp-text-secondary);
      margin-bottom: 6px;
    }
    .securepass-panel ul {
      margin: 0;
      padding-left: 1.2rem;
      max-height: 72px;
      overflow-y: auto;
      font-size: 0.72rem;
      color: var(--sp-text-muted);
    }
    .securepass-panel ul li { margin-bottom: 2px; }
    .securepass-section {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--sp-divider);
    }

    /* ── Buttons ── */
    .securepass-actions {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 10px;
    }
    .securepass-actions-row {
      display: flex;
      gap: 5px;
      align-items: stretch;
    }
    .securepass-btn {
      flex: 1;
      border: 1px solid var(--sp-border);
      border-radius: 8px;
      background: var(--sp-surface);
      color: var(--sp-text);
      padding: 6px 10px;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.18s ease;
      white-space: nowrap;
      outline: none;
      font-family: inherit;
    }
    .securepass-btn:hover {
      background: var(--sp-surface-hover);
      border-color: var(--sp-border-hover);
    }
    .securepass-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--sp-accent-glow);
    }
    .securepass-btn.primary {
      background: var(--sp-accent-bg);
      border-color: transparent;
      color: #fff;
    }
    .securepass-btn.primary:hover {
      filter: brightness(1.1);
      box-shadow: 0 0 12px var(--sp-accent-glow);
    }

    /* Options toggle */
    .securepass-options-btn {
      flex: 0 0 auto;
      border: 1px solid var(--sp-border);
      border-radius: 8px;
      background: var(--sp-surface);
      color: var(--sp-text-secondary);
      cursor: pointer;
      padding: 6px 8px;
      font-size: 0.78rem;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.18s ease;
      white-space: nowrap;
      outline: none;
      font-family: inherit;
    }
    .securepass-options-btn:hover, .securepass-options-btn.open {
      background: var(--sp-surface-hover);
      border-color: var(--sp-border-hover);
      color: var(--sp-text);
    }
    .securepass-options-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--sp-accent-glow);
    }

    /* Icon buttons */
    .securepass-icon-btn {
      flex: 0 0 auto;
      background: none;
      border: none;
      color: var(--sp-text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      transition: all 0.15s ease;
      outline: none;
    }
    .securepass-icon-btn:hover {
      background: var(--sp-surface-hover);
      color: var(--sp-text);
    }
    .securepass-icon-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--sp-accent-glow);
    }
    .securepass-icon-btn svg { width: 14px; height: 14px; }

    /* Status */
    .securepass-status {
      font-size: 0.68rem;
      margin-top: 6px;
      text-align: center;
      color: var(--sp-text-muted);
      min-height: 14px;
    }

    /* Gen settings */
    .securepass-gen-settings {
      display: none;
      margin-top: 2px;
      padding: 8px;
      background: var(--sp-settings-bg);
      border-radius: 8px;
      border: 1px solid var(--sp-border);
      font-size: 0.72rem;
    }
    .securepass-gen-settings.open {
      display: block;
      animation: securepass-slide-in 0.15s ease;
    }
    .securepass-gen-settings label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
      cursor: pointer;
      color: var(--sp-text-secondary);
    }
    .securepass-gen-settings input[type="range"] {
      width: 100%;
      margin: 3px 0 6px 0;
      accent-color: var(--sp-accent);
    }
    .securepass-gen-settings input[type="checkbox"] {
      accent-color: var(--sp-accent);
    }

    /* ── Credential Stubs ── */
    .securepass-stub {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      background: var(--sp-stub-bg);
      border: 1px solid var(--sp-stub-border);
      border-radius: 9px;
      padding: 7px 10px;
      margin-bottom: 4px;
      cursor: pointer;
      transition: all 0.18s ease;
      outline: none;
      color: var(--sp-text);
      font-family: inherit;
      font-size: 0.78rem;
    }
    .securepass-stub:hover { background: rgba(37,99,235,0.16); border-color: rgba(37,99,235,0.35); }
    .securepass-stub:focus-visible { box-shadow: 0 0 0 2px var(--sp-accent-glow); }
    .securepass-stub:last-child { margin-bottom: 0; }
    .securepass-stub-avatar {
      width: 26px; height: 26px;
      border-radius: 6px;
      background: var(--sp-surface);
      display: grid; place-items: center;
      flex-shrink: 0;
    }
    .securepass-stub-info { flex: 1; text-align: left; min-width: 0; }
    .securepass-stub-user { font-weight: 600; font-size: 0.78rem; color: var(--sp-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .securepass-stub-site { font-size: 0.62rem; color: var(--sp-text-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .securepass-stub-action { color: var(--sp-accent); flex-shrink: 0; }

    /* ── Auth Overlay ── */
    .securepass-auth-overlay {
      position: absolute;
      inset: 0;
      border-radius: 14px;
      background: var(--sp-overlay-bg);
      backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 18px;
      z-index: 10;
      animation: securepass-slide-in 0.2s ease;
      cursor: grab;
      user-select: none;
    }
    .securepass-auth-overlay:active {
      cursor: grabbing;
    }
    .securepass-auth-overlay h4 {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--sp-text);
      text-align: center;
    }
    .securepass-auth-overlay p {
      font-size: 0.72rem;
      color: var(--sp-text-muted);
      margin: 0;
      text-align: center;
      line-height: 1.5;
    }
    .securepass-auth-input-wrap {
      width: 100%;
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .securepass-auth-input {
      flex: 1;
      background: var(--sp-input-bg);
      border: 1px solid var(--sp-input-border);
      border-radius: 8px;
      color: var(--sp-text);
      padding: 8px 10px;
      font-size: 0.8rem;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s ease;
    }
    .securepass-auth-input:focus { border-color: var(--sp-accent); }
    .securepass-auth-input.shake {
      animation: sp-shake 0.35s ease;
      border-color: var(--sp-danger);
    }
    @keyframes sp-shake {
      0%,100% { transform: translateX(0); }
      20%     { transform: translateX(-5px); }
      60%     { transform: translateX(5px); }
    }
    .securepass-auth-error {
      font-size: 0.7rem;
      color: var(--sp-danger);
      text-align: center;
      min-height: 14px;
    }
    .securepass-auth-divider {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.68rem;
      color: var(--sp-text-muted);
    }
    .securepass-auth-divider::before,.securepass-auth-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--sp-divider);
    }
    .securepass-auth-close {
      position: absolute;
      top: 8px; right: 8px;
      background: none;
      border: none;
      color: var(--sp-text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: grid; place-items: center;
      transition: color 0.15s ease;
    }
    .securepass-auth-close:hover { color: var(--sp-text-secondary); }
  `;
  shadowRoot.appendChild(style);

  // ── Resolve theme ──
  async function resolveThemeClass() {
    try {
      const syncInfo = await chrome.storage.local.get('settingsSync');
      const area = syncInfo?.settingsSync?.useSync ? 'sync' : 'local';
      const stored = await chrome.storage[area].get('settings');
      const theme = stored?.settings?.theme || 'system';
      if (theme === 'dark') return 'sp-dark';
      if (theme === 'light') return 'sp-light';
      // system: follow OS preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sp-dark' : 'sp-light';
    } catch {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sp-dark' : 'sp-light';
    }
  }

  function updateAllThemes() {
    resolveThemeClass().then(cls => {
      shadowRoot.querySelectorAll('.securepass-panel').forEach(panel => {
        panel.classList.remove('sp-dark', 'sp-light');
        panel.classList.add(cls);
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.settingsSync) updateAllThemes();
    if (changes.settings) updateAllThemes();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateAllThemes);

  const [{ observePasswordFields }, passwordModule] = await Promise.all([
    import(chrome.runtime.getURL('src/formAnalyzer.js')),
    import(chrome.runtime.getURL('src/passwordStrength.js'))
  ]);

  const tracked = new Map();

  document.addEventListener('submit', (e) => {
    for (const [field, entry] of tracked.entries()) {
      if (field.form === e.target || e.composedPath().includes(field.form)) {
        const pass = field.value;
        if (!pass) continue;
        const user = entry.constraints.usernameField ? entry.constraints.usernameField.value : '';
        chrome.runtime.sendMessage({
          type: 'PROMPT_SAVE_CREDENTIAL',
          entry: {
            site: window.location.origin,
            username: user,
            password: pass,
            notes: 'Auto-saved after submit'
          },
          origin: window.location.hostname
        }, () => {});
      }
    }
  }, true);

  function mapScoreToColor(score) {
    if (score >= 0.8) return 'linear-gradient(90deg,#22c55e,#16a34a)';
    if (score >= 0.6) return 'linear-gradient(90deg,#84cc16,#22c55e)';
    if (score >= 0.4) return 'linear-gradient(90deg,#facc15,#f97316)';
    return 'linear-gradient(90deg,#ef4444,#dc2626)';
  }

  function positionFloating(button, field) {
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      button.style.opacity = '0';
      button.style.pointerEvents = 'none';
      return;
    }
    button.style.opacity = '';
    button.style.pointerEvents = '';
    const top = rect.top + rect.height / 2 - 13; // 13 = half of 26px button
    // Position outside the field to the right
    let left = rect.right + 4;
    // If not enough space on the right, fall back to inside-right
    if (left + 26 > window.innerWidth) {
      left = rect.right - 32;
    }
    button.style.top = `${Math.max(0, top)}px`;
    button.style.left = `${Math.max(0, left)}px`;
  }

  function positionPanel(panel, field) {
    // Only set position once (on first call). After that the panel stays put and scrolls internally.
    if (panel.dataset.positioned) return;
    const rect = field.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;

    // Clamp right overflow
    if (left + 320 > window.innerWidth) {
      left = window.innerWidth - 328;
    }
    // If it would go off screen bottom, show above
    const maxH = 460;
    if (top + maxH > window.innerHeight) {
      top = Math.max(6, rect.top - maxH - 6);
    }

    panel.style.top = `${Math.max(6, top)}px`;
    panel.style.left = `${Math.max(6, left)}px`;
    panel.dataset.positioned = '1';
  }

  function updatePanel(panel, password, constraints) {
    const { score, verdict, entropy, suggestions } = passwordModule.evaluatePassword(password);
    panel.querySelector('.securepass-meter div').style.width = `${Math.max(score * 100, 6)}%`;
    panel.querySelector('.securepass-meter div').style.background = mapScoreToColor(score);
    panel.querySelector('.securepass-verdict').textContent = verdict;
    panel.querySelector('.securepass-entropy').textContent = `${entropy} bits`;
    const list = panel.querySelector('ul');
    if (list) {
      list.innerHTML = '';
      suggestions.forEach(tip => {
        const li = document.createElement('li');
        li.textContent = tip;
        list.appendChild(li);
      });
      if (!suggestions.length && password.length > 0) {
        const li = document.createElement('li');
        li.textContent = 'Looking strong. Keep it memorable.';
        list.appendChild(li);
      }
    }
  }

  function createPanel(field, constraints, button) {
    const isLogin = constraints.context === 'login';
    const isRegister = constraints.context === 'register';

    const panel = document.createElement('div');
    panel.className = 'securepass-panel';
    
    let contentHtml = `
      <div class="securepass-panel-header">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#3b82f6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          SecurePass
          <span class="context-badge">${isLogin ? 'Login' : (isRegister ? 'Register' : 'Password')}</span>
        </h3>
        <div style="display:flex; gap:4px;">
          <button type="button" class="securepass-icon-btn copy-btn" title="Copy password">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button type="button" class="securepass-icon-btn toggle-vis-btn" title="Show/Hide password">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </div>
    `;

    // Only show full meter if registering or unknown
    if (!isLogin) {
      contentHtml += `
        <div class="securepass-meter"><div></div></div>
        <div class="securepass-meta">
          <span class="securepass-verdict">Weak</span>
          <span class="securepass-entropy">0 bits</span>
        </div>
        <ul></ul>
      `;
    }

    contentHtml += `
      <div class="securepass-section securepass-autofill-section" style="display:none;">
        <h3 style="margin-bottom:6px; font-size:0.72rem; color:var(--sp-text-secondary);">Saved Credentials</h3>
        <div class="autofill-list" style="display:flex; flex-direction:column; gap:4px;"></div>
      </div>
    `;

    const genSettingsHtml = `
      <div class="securepass-gen-settings">
        <label>Length: <span class="gen-len-val">16</span></label>
        <input type="range" class="gen-len" min="12" max="64" value="16">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
          <label><input type="checkbox" class="gen-upper" checked> A-Z</label>
          <label><input type="checkbox" class="gen-lower" checked> a-z</label>
          <label><input type="checkbox" class="gen-num" checked> 0-9</label>
          <label><input type="checkbox" class="gen-sym" checked> !@#</label>
        </div>
      </div>
    `;

    // ── Row 1: Generate + Options toggle ──
    const generateIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;
    const optionsIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    const saveIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
    const hibpIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    let actionsHtml = `<div class="securepass-actions">`;

    if (!isLogin) {
      // Row 1: Generate (grows) + Options
      actionsHtml += `
        <div class="securepass-actions-row">
          <button type="button" class="securepass-btn securepass-generate" tabindex="0">${generateIcon} Generate</button>
          <button type="button" class="securepass-options-btn gen-settings-btn" title="Generator options" tabindex="0">${optionsIcon} Options</button>
        </div>
        ${genSettingsHtml}
        <div class="securepass-actions-row">
          <button type="button" class="securepass-btn securepass-save primary" tabindex="0">${saveIcon} Save credential</button>
        </div>
      `;
    } else {
      // Login: just Generate + Options
      actionsHtml += `
        <div class="securepass-actions-row">
          <button type="button" class="securepass-btn securepass-generate" tabindex="0">${generateIcon} Generate</button>
          <button type="button" class="securepass-options-btn gen-settings-btn" title="Generator options" tabindex="0">${optionsIcon} Options</button>
        </div>
        ${genSettingsHtml}
      `;
    }

    // HIBP row — always shown
    actionsHtml += `
      <div class="securepass-actions-row">
        <button type="button" class="securepass-btn securepass-hibp" tabindex="0">${hibpIcon} Check if Pwned (HIBP)</button>
      </div>
    `;

    actionsHtml += `</div>`;

    contentHtml += actionsHtml;
    contentHtml += `<div class="securepass-status"></div>`;

    panel.innerHTML = contentHtml;
    shadowRoot.appendChild(panel);

    // Apply theme
    resolveThemeClass().then(cls => panel.classList.add(cls));

    // Make panel draggable via header
    const header = panel.querySelector('.securepass-panel-header');
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let initialTop = 0, initialLeft = 0;

    const handleDrag = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      panel.style.top = `${Math.max(0, initialTop + dy)}px`;
      panel.style.left = `${Math.max(0, initialLeft + dx)}px`;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      panel.dataset.positioned = '1'; // prevent position recalculation
    };

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('mousemove', handleDrag, true);
      document.removeEventListener('mouseup', stopDrag, true);
    };

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return; // let buttons work normally
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialTop = rect.top;
      initialLeft = rect.left;
      
      document.addEventListener('mousemove', handleDrag, true);
      document.addEventListener('mouseup', stopDrag, true);
    });
    
    if (!isLogin) {
      updatePanel(panel, field.value, constraints);
    }
    positionPanel(panel, field);

    const statusEl = panel.querySelector('.securepass-status');
    const generateBtn = panel.querySelector('.securepass-generate');
    const saveBtn = panel.querySelector('.securepass-save');
    const hibpBtn = panel.querySelector('.securepass-hibp');
    const copyBtn = panel.querySelector('.copy-btn');
    const toggleBtn = panel.querySelector('.toggle-vis-btn');
    const genSettingsBtn = panel.querySelector('.gen-settings-btn');
    const genSettingsPanel = panel.querySelector('.securepass-gen-settings');
    const lenInput = panel.querySelector('.gen-len');
    const lenVal = panel.querySelector('.gen-len-val');
    const checks = ['upper', 'lower', 'num', 'sym'].map(k => ({ key: k, el: panel.querySelector(`.gen-${k}`) }));

    if (genSettingsBtn && genSettingsPanel) {
      genSettingsBtn.addEventListener('click', () => {
        const isOpen = genSettingsPanel.classList.toggle('open');
        genSettingsBtn.classList.toggle('open', isOpen);
        // Panel position is locked — no reposition needed. Panel scrolls internally.
      });
      lenInput.addEventListener('input', e => {
        lenVal.textContent = e.target.value;
        constraints.maxLength = parseInt(e.target.value, 10);
      });
      checks.forEach(({ key, el }) => {
        el.addEventListener('change', () => {
          if (!constraints.customRequirements) constraints.customRequirements = {};
          if (key === 'upper') constraints.customRequirements.requiresUppercase = el.checked;
          if (key === 'lower') constraints.customRequirements.requiresLowercase = el.checked;
          if (key === 'num') constraints.customRequirements.requiresNumber = el.checked;
          if (key === 'sym') constraints.customRequirements.requiresSymbol = el.checked;
        });
      });
    }

    // Show/Hide password toggle logic
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const type = field.getAttribute('type') === 'password' ? 'text' : 'password';
        field.setAttribute('type', type);
        toggleBtn.innerHTML = type === 'password'
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      });
    }

    // Copy to clipboard
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!field.value) return;
        try {
          await navigator.clipboard.writeText(field.value);
          statusEl.textContent = 'Copied to clipboard!';
          statusEl.style.color = '#22c55e';
          setTimeout(() => statusEl.textContent = '', 2000);
        } catch(e) {
          statusEl.textContent = 'Failed to copy.';
        }
      });
    }

    // ─── Credential Stubs (always visible, even when vault is locked) ───
    const host = window.location.hostname;
    let vaultUnlocked = false;
    let activeBiometricSessionId = null;

    // Helper: fill the form with a fully-decrypted credential
    function fillCredential(m) {
      field.value = m.password;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      let userFilled = false;
      if (m.username) {
        if (constraints.usernameField) {
          constraints.usernameField.value = m.username;
          constraints.usernameField.dispatchEvent(new Event('input', { bubbles: true }));
          userFilled = true;
        }
        if (!userFilled) {
          const form = field.form || field.closest('form');
          const userField = form
            ? Array.from(form.elements).find(el =>
                el !== field && el.tagName === 'INPUT' &&
                (el.type === 'text' || el.type === 'email' ||
                  el.name?.toLowerCase().includes('user') ||
                  el.name?.toLowerCase().includes('email'))
              )
            : document.querySelector('input[type="text"],input[type="email"]');
          if (userField) {
            userField.value = m.username;
            userField.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
      statusEl.textContent = 'Filled!';
      statusEl.style.color = '#22c55e';
      setTimeout(() => {
        cleanup();
        if (AUTO_SUBMIT_ENABLED && field.form) {
          try { field.form.requestSubmit(); } catch { try { field.form.submit(); } catch {} }
        }
      }, 800);
    }

    // Helper: show inline auth overlay (master password + biometric)
    function showAuthOverlay(credentialId, initialError = '') {
      // Remove any existing overlay
      const existing = panel.querySelector('.securepass-auth-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'securepass-auth-overlay';

      // Build biometric button HTML only if it might be available
      const bioHtml = `
        <div id="sp-bio-container" style="display: none; width: 100%; flex-direction: column; gap: 10px; align-items: center;">
          <button type="button" id="sp-bio-btn" class="securepass-btn" style="width:100%;gap:8px;" tabindex="0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3v1H9v-1c0-1.657 1.343-3 3-3z"/>
              <rect x="3" y="13" width="18" height="8" rx="2"/>
              <circle cx="12" cy="8" r="5" stroke-dasharray="3 2"/>
            </svg>
            Try Biometric Again
          </button>
          <button type="button" id="sp-show-manual" class="securepass-btn" style="width:100%;gap:8px;background:transparent;border-color:transparent;color:var(--sp-text-secondary);" tabindex="0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
            </svg>
            Use Master Password
          </button>
        </div>
      `;

      overlay.innerHTML = `
        <button type="button" class="securepass-auth-close" id="sp-auth-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <svg width="32" height="32" id="sp-auth-icon" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h4 id="sp-auth-title">Verify Your Identity</h4>
        <div class="securepass-auth-error" id="sp-auth-error" style="margin: 0; text-align: center; width: 100%;"></div>
        
        ${bioHtml}

        <div id="sp-manual-container" style="display: flex; flex-direction: column; width: 100%; gap: 12px; align-items: center;">
          <p style="margin: 0;">Enter your master password.</p>
          <div class="securepass-auth-input-wrap">
            <input type="password" class="securepass-auth-input" id="sp-auth-pass"
              placeholder="Master password" autocomplete="current-password" tabindex="0">
            <button type="button" class="securepass-icon-btn" id="sp-auth-vis" title="Show">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <button type="button" id="sp-auth-confirm" class="securepass-btn primary" style="width:100%;" tabindex="0">
            Unlock and Fill
          </button>
        </div>
      `;
      panel.style.position = 'fixed';
      panel.appendChild(overlay);

      // Make overlay draggable
      overlay.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialTop = rect.top;
        initialLeft = rect.left;
        
        document.addEventListener('mousemove', handleDrag, true);
        document.addEventListener('mouseup', stopDrag, true);
      });

      positionPanel(panel, field);

      const passInput = overlay.querySelector('#sp-auth-pass');
      const confirmBtn = overlay.querySelector('#sp-auth-confirm');
      const errorEl   = overlay.querySelector('#sp-auth-error');
      const visBtn    = overlay.querySelector('#sp-auth-vis');
      const closeBtn  = overlay.querySelector('#sp-auth-close');
      const bioBtn    = overlay.querySelector('#sp-bio-btn');

      if (initialError) {
        errorEl.textContent = initialError;
      }

      const resetBiometricAttempt = () => {
        activeBiometricSessionId = null;
        bioBtn.disabled = false;
        const authIframe = overlay.querySelector('.securepass-auth-iframe');
        if (authIframe) authIframe.remove();
      };

      closeBtn.addEventListener('click', () => {
        resetBiometricAttempt();
        overlay.remove();
      });
      visBtn.addEventListener('click', () => {
        passInput.type = passInput.type === 'password' ? 'text' : 'password';
      });

      let attempts = 0;
      async function attemptUnlock() {
        const pass = passInput.value.trim();
        if (!pass) { passInput.classList.add('shake'); setTimeout(() => passInput.classList.remove('shake'), 400); return; }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Verifying...';
        errorEl.textContent = '';

        const res = await new Promise(r =>
          chrome.runtime.sendMessage({ type: 'UNLOCK_AND_FILL', passphrase: pass, credentialId }, r)
        );

        if (res?.ok && res.entry) {
          overlay.remove();
          fillCredential(res.entry);
        } else {
          attempts++;
          passInput.value = '';
          passInput.classList.add('shake');
          setTimeout(() => passInput.classList.remove('shake'), 400);
          errorEl.textContent = res?.error || 'Incorrect password.';
          if (attempts >= 3) {
            confirmBtn.disabled = true;
            if (bioBtn) bioBtn.disabled = true;
            errorEl.textContent = 'Too many attempts. Please wait 30 seconds.';
            setTimeout(() => {
              confirmBtn.disabled = false;
              if (bioBtn) bioBtn.disabled = false;
              attempts = 0;
              errorEl.textContent = '';
              confirmBtn.textContent = 'Unlock and Fill';
            }, 30000);
          } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Unlock and Fill';
          }
        }
      }

      confirmBtn.addEventListener('click', attemptUnlock);
      passInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptUnlock(); });
      setTimeout(() => passInput.focus(), 60);

      // Biometric auth
      const bioContainer = overlay.querySelector('#sp-bio-container');
      const manualContainer = overlay.querySelector('#sp-manual-container');
      const showManualBtn = overlay.querySelector('#sp-show-manual');

      chrome.runtime.sendMessage({ type: 'BIOMETRIC_STATUS' }, res => {
        if (res?.ok && res.enabled) {
          bioContainer.style.display = 'flex';
          manualContainer.style.display = 'none';
        }
      });

      if (bioBtn) {
        if (showManualBtn) {
          showManualBtn.addEventListener('click', () => {
            bioContainer.style.display = 'none';
            manualContainer.style.display = 'flex';
            setTimeout(() => passInput.focus(), 60);
          });
        }

        bioBtn.addEventListener('click', async () => {
          resetBiometricAttempt();
          bioBtn.disabled = true;
          errorEl.textContent = '';
          const res = await new Promise(r =>
            chrome.runtime.sendMessage({ type: 'BIOMETRIC_AUTH_START', credentialId }, r)
          );
          if (!res?.ok) {
            bioBtn.disabled = false;
            errorEl.textContent = res?.error || 'Unable to start biometric authentication.';
          } else {
            activeBiometricSessionId = res.sessionId;
            try {
              const completeRes = await runBiometricAssertion(credentialId, res.sessionId);
              if (!completeRes?.ok) {
                throw new Error(completeRes?.error || 'Authentication failed.');
              }
            } catch (err) {
              activeBiometricSessionId = null;
              bioBtn.disabled = false;
              errorEl.textContent = err?.message || 'Authentication cancelled.';
            }
          }
        });
      }
    }

    // Listen for biometric fill result from background
    const biometricResultListener = (msg) => {
      if (msg.type !== 'BIOMETRIC_FILL_RESULT') return;
      if (!activeBiometricSessionId || msg.sessionId !== activeBiometricSessionId) return;
      activeBiometricSessionId = null;
      const overlay = panel.querySelector('.securepass-auth-overlay');
      const authIframe = overlay?.querySelector('.securepass-auth-iframe');
      if (authIframe) authIframe.remove();
      
      if (msg.entry) {
        if (overlay) overlay.remove();
        fillCredential(msg.entry);
      } else {
        const errorEl = overlay?.querySelector('#sp-auth-error');
        if (errorEl) errorEl.textContent = msg.error || 'Authentication failed.';
        const bioBtn = overlay?.querySelector('#sp-bio-btn');
        if (bioBtn) { 
          bioBtn.disabled = false; 
        }
      }
    };
    chrome.runtime.onMessage.addListener(biometricResultListener);

    // Render stub list from metadata (works even when vault is locked)
    function renderStubs(metaList, unlockedEntries) {
      const section = panel.querySelector('.securepass-autofill-section');
      const list    = section.querySelector('.autofill-list');
      list.innerHTML = '';

      const matches = metaList.filter(m => {
        try {
          const mHost = new URL(m.site.startsWith('http') ? m.site : `https://${m.site}`).hostname;
          return mHost === host || host.endsWith('.' + mHost) || mHost.endsWith('.' + host);
        } catch { return m.site === host || host.endsWith('.' + m.site) || m.site.endsWith('.' + host); }
      });

      if (!matches.length) {
        if (isLogin) statusEl.textContent = 'No saved password for this site.';
        return;
      }

      section.style.display = 'block';
      matches.forEach(m => {
        const stub = document.createElement('button');
        stub.type = 'button';
        stub.className = 'securepass-stub';
        stub.tabIndex = 0;
        stub.innerHTML = `
          <div class="securepass-stub-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div class="securepass-stub-info">
            <div class="securepass-stub-user">${m.username || 'No username'}</div>
            <div class="securepass-stub-site">${host}</div>
          </div>
          <span class="securepass-stub-action">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${vaultUnlocked
                ? '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
                : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
              }
            </svg>
          </span>
        `;
        stub.addEventListener('click', async () => {
          if (vaultUnlocked) {
            // Vault already open: fetch directly
            const fullEntry = unlockedEntries?.find(e => e.id === m.id);
            if (fullEntry) { fillCredential(fullEntry); return; }
            // Shouldn't happen, but fallback
            chrome.runtime.sendMessage({ type: 'GET_CREDENTIAL', credentialId: m.id }, res => {
              if (res?.ok && res.entry) fillCredential(res.entry);
              else showAuthOverlay(m.id, 'Biometric authentication failed.');
            });
          } else {
            try {
              const biometricRes = await tryBiometricUnlock(m.id);
              if (biometricRes?.ok && biometricRes.entry) {
                fillCredential(biometricRes.entry);
                return;
              }
              showAuthOverlay(m.id, biometricRes?.error || 'Biometric authentication failed.');
            } catch {
              showAuthOverlay(m.id, 'Biometric authentication failed.');
            }
          }
        });
        list.appendChild(stub);
      });
      setTimeout(() => positionPanel(panel, field), 10);
    }

    // 1. Fetch metadata immediately (no vault needed)
    chrome.runtime.sendMessage({ type: 'LIST_CREDENTIALS_META' }, metaRes => {
      if (chrome.runtime.lastError) metaRes = { ok: true, meta: [] };
      const meta = metaRes?.meta || [];

      // Render stubs from metadata right away (vault may still be locked)
      if (meta.length) renderStubs(meta, null);

      // 2. Check vault status + get full entries if unlocked
      chrome.runtime.sendMessage({ type: 'LIST_CREDENTIALS' }, fullRes => {
        if (chrome.runtime.lastError || !fullRes?.ok) return;
        vaultUnlocked = fullRes.unlocked;

        if (fullRes.unlocked && fullRes.entries?.length) {
          // Build stubs from real entries (covers pre-existing credentials with no metadata)
          const fullMeta = fullRes.entries.map(e => ({
            id: e.id, username: e.username || '', site: e.site || '',
            createdAt: e.createdAt, updatedAt: e.updatedAt,
          }));
          renderStubs(fullMeta, fullRes.entries);
        } else if (!meta.length && isLogin) {
          statusEl.textContent = 'No saved password for this site.';
        }
      });
    });


    const ro = new ResizeObserver(() => positionPanel(panel, field));
    ro.observe(field);

    const scrollHandler = () => positionPanel(panel, field);
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', scrollHandler);

    const inputHandler = () => {
      if (!isLogin) updatePanel(panel, field.value, constraints);
      statusEl.textContent = '';
      statusEl.style.color = '#94a3b8';
      
      // Mirror to confirm field if it's there and empty/partially filled
      if (constraints.confirmField && constraints.confirmField.value !== field.value) {
         // Auto-fill confirm only if generate was used or it's empty, but let's be careful
      }
    };
    field.addEventListener('input', inputHandler);

    const outsideHandler = event => {
      const path = event.composedPath();
      // With mode:'closed', path from document stops at shadowHost — panel/button are hidden.
      // So we must also check for shadowHost in the path.
      if (path.includes(panel) || path.includes(button) || path.includes(shadowHost)) return;
      cleanup();
    };
    document.addEventListener('mousedown', outsideHandler, true);

    panel.tabIndex = -1;
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        field.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const focusables = Array.from(panel.querySelectorAll('button, input, [tabindex="0"]')).filter(el => el.offsetParent !== null);
        const index = focusables.indexOf(document.activeElement);
        if (index > -1 || e.target === panel) {
          e.preventDefault();
          let next = index;
          if (e.key === 'ArrowDown') next = index + 1;
          if (e.key === 'ArrowUp') next = index - 1;
          if (next >= focusables.length) next = 0;
          if (next < 0) next = focusables.length - 1;
          focusables[next].focus();
        }
      }
    });

    const fieldKeydown = (e) => {
      if (e.key === 'ArrowDown' && panel.parentElement) {
        e.preventDefault();
        const first = panel.querySelector('button, [tabindex="0"]');
        if (first) first.focus();
      } else if (e.key === 'Escape' && panel.parentElement) {
        e.preventDefault();
        cleanup();
      }
    };
    field.addEventListener('keydown', fieldKeydown);

    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateBtn.innerHTML = 'Generating...';
        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'GENERATE_PASSWORD', constraints }, res => {
            if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
            resolve(res);
          });
        });
        generateBtn.disabled = false;
        generateBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg> Generate`;
        
        if (!response || !response.ok) {
          statusEl.textContent = response?.error || 'Unable to generate password.';
          statusEl.style.color = '#ef4444';
          return;
        }
        
        field.value = response.password;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Auto-fill confirm field
        if (constraints.confirmField) {
           constraints.confirmField.value = response.password;
           constraints.confirmField.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (!isLogin) updatePanel(panel, field.value, constraints);
        statusEl.textContent = 'Generated password applied.';
        statusEl.style.color = '#22c55e';
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const pass = field.value;
        if (!pass) {
          statusEl.textContent = 'Password is empty.';
          statusEl.style.color = '#ef4444';
          return;
        }
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Saving...';
        
        let user = '';
        if (constraints.usernameField) {
           user = constraints.usernameField.value;
        }

        const entry = {
          site: window.location.origin,
          username: user,
          password: pass,
          notes: 'Saved from inline assistant'
        };

        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'STORE_CREDENTIAL', entry }, res => {
             if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
             resolve(res);
          });
        });

        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save`;

        if (!response || !response.ok) {
           if (response?.error === 'Vault is locked') {
              statusEl.textContent = 'Vault locked! Unlock in extension.';
           } else {
              statusEl.textContent = response?.error || 'Failed to save.';
           }
           statusEl.style.color = '#ef4444';
           return;
        }
        statusEl.textContent = 'Credential saved!';
        statusEl.style.color = '#22c55e';
        setTimeout(() => cleanup(), 1500);
      });
    }

    if (hibpBtn) {
      hibpBtn.addEventListener('click', async () => {
        if (!field.value) return;
        hibpBtn.disabled = true;
        statusEl.textContent = 'Checking HIBP…';
        statusEl.style.color = '#94a3b8';
        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'HIBP_CHECK', password: field.value }, res => {
            if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
            resolve(res);
          });
        });
        hibpBtn.disabled = false;
        if (!response || !response.ok) {
          statusEl.textContent = response?.error || 'HIBP check failed.';
          statusEl.style.color = '#ef4444';
          return;
        }
        if (response.result?.compromised) {
           statusEl.textContent = `Breached ${response.result.count.toLocaleString()} times`;
           statusEl.style.color = '#ef4444';
        } else {
           statusEl.textContent = 'Not found in breaches (Safe)';
           statusEl.style.color = '#22c55e';
        }
      });
    }

    const cleanup = () => {
      document.removeEventListener('mousedown', outsideHandler, true);
      window.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', scrollHandler);
      field.removeEventListener('input', inputHandler);
      field.removeEventListener('keydown', fieldKeydown);
      chrome.runtime.onMessage.removeListener(biometricResultListener);
      ro.disconnect();
      panel.remove();
      button.classList.remove('securepass-floating--active');
      const entry = tracked.get(field);
      if (entry) {
        entry.panelCleanup = null;
      }
    };

    return cleanup;
  }

  function attachButton(field, constraints) {
    if (tracked.has(field)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'securepass-floating';
    button.title = 'SecurePass';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
    `;
    button.setAttribute('aria-label', 'Open SecurePass tools');
    shadowRoot.appendChild(button);

    const reposition = () => positionFloating(button, field);
    const ro = new ResizeObserver(reposition);
    ro.observe(field);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    reposition();

    // Hover logic to focus field/button
    field.addEventListener('focus', () => button.classList.add('securepass-floating--focused'));
    field.addEventListener('blur', () => button.classList.remove('securepass-floating--focused'));

    const entry = { button, constraints, panelCleanup: null };
    tracked.set(field, entry);

    const removalObserver = new MutationObserver(() => {
      if (!document.body.contains(field)) {
        cleanup();
        removalObserver.disconnect();
      }
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });

    function cleanup() {
      if (entry.panelCleanup) {
        entry.panelCleanup();
      }
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      ro.disconnect();
      removalObserver.disconnect();
      button.remove();
      tracked.delete(field);
    }

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      field.focus();
      if (entry.panelCleanup) {
        entry.panelCleanup();
        entry.panelCleanup = null;
        return;
      }
      button.classList.add('securepass-floating--active');
      entry.panelCleanup = createPanel(field, constraints, button);
    });
  }

  observePasswordFields((field, constraints) => {
    attachButton(field, constraints);
  });
})();
