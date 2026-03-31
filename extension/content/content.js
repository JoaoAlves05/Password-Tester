(async () => {
  const AUTO_SUBMIT_ENABLED = true;

  const shadowHost = document.createElement('div');
  shadowHost.id = 'securepass-extension-root';
  shadowHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483647; overflow: visible;';
  document.body.appendChild(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    .securepass-floating {
      pointer-events: auto;
      position: fixed;
      z-index: 2147483646;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: none;
      background: rgba(37, 99, 235, 0.15);
      opacity: 0.5;
      backdrop-filter: blur(4px);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
    }
    .securepass-floating:hover, .securepass-floating--focused, .securepass-floating--active {
      opacity: 1;
      background: rgba(37, 99, 235, 0.85);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
    }
    .securepass-floating svg {
      width: 14px;
      height: 14px;
      color: #3b82f6;
      transition: color 0.2s ease;
    }
    .securepass-floating:hover svg, .securepass-floating--focused svg, .securepass-floating--active svg {
      color: #ffffff;
    }
    .securepass-panel {
      pointer-events: auto;
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      border-radius: 16px;
      padding: 16px;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      font-family: 'Inter', system-ui, sans-serif;
      animation: securepass-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: top center;
    }
    @keyframes securepass-slide-in {
      from { opacity: 0; transform: translateY(-8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .securepass-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .securepass-panel h3 {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .securepass-panel .context-badge {
      font-size: 0.65rem;
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
    }
    .securepass-meter {
      height: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
      margin-bottom: 6px;
    }
    .securepass-meter div {
      height: 100%;
      width: 6%;
      border-radius: inherit;
      background: #ef4444;
      transition: width 0.3s ease, background 0.3s ease;
    }
    .securepass-meta {
      font-size: 0.75rem;
      display: flex;
      justify-content: space-between;
      color: #cbd5e1;
      margin-bottom: 8px;
    }
    .securepass-panel ul {
      margin: 0;
      padding-left: 1.2rem;
      max-height: 80px;
      overflow-y: auto;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .securepass-panel ul li { margin-bottom: 2px; }
    .securepass-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    /* ── Action rows ── */
    .securepass-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 12px;
    }
    .securepass-actions-row {
      display: flex;
      gap: 6px;
      align-items: stretch;
    }
    .securepass-btn {
      flex: 1;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #f8fafc;
      padding: 7px 10px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s ease;
      white-space: nowrap;
      outline: none;
    }
    .securepass-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.25);
    }
    .securepass-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6);
    }
    .securepass-btn.primary {
      background: rgba(37, 99, 235, 0.85);
      border-color: transparent;
    }
    .securepass-btn.primary:hover {
      background: rgba(37, 99, 235, 1);
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.45);
    }
    /* Options toggle button — sits inline with Generate */
    .securepass-options-btn {
      flex: 0 0 auto;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #94a3b8;
      cursor: pointer;
      padding: 7px 9px;
      font-size: 0.82rem;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
      white-space: nowrap;
      outline: none;
    }
    .securepass-options-btn:hover, .securepass-options-btn.open {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.25);
      color: #f8fafc;
    }
    .securepass-options-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6);
    }
    .securepass-icon-btn {
      flex: 0 0 auto;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 5px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      transition: all 0.15s ease;
      outline: none;
    }
    .securepass-icon-btn:hover {
      background: rgba(255,255,255,0.1);
      color: #f8fafc;
    }
    .securepass-icon-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6);
    }
    .securepass-icon-btn svg { width: 14px; height: 14px; }
    .securepass-status {
      font-size: 0.7rem;
      margin-top: 8px;
      text-align: center;
      color: #94a3b8;
      min-height: 14px;
    }
    .autofill-btn {
      width: 100%;
      background: rgba(37, 99, 235, 0.15);
      border: 1px solid rgba(37, 99, 235, 0.3);
      border-radius: 8px;
      color: #f8fafc;
      padding: 8px 12px;
      font-size: 0.8rem;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      outline: none;
    }
    .autofill-btn:hover {
      background: rgba(37, 99, 235, 0.3);
      border-color: rgba(37, 99, 235, 0.5);
    }
    .autofill-icon {
      background: #1e293b;
      padding: 4px;
      border-radius: 4px;
      display: grid;
      place-items: center;
    }
    .securepass-gen-settings {
      display: none;
      margin-top: 2px;
      padding: 10px;
      background: rgba(0,0,0,0.25);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.07);
      font-size: 0.75rem;
    }
    .securepass-gen-settings.open {
      display: block;
      animation: securepass-slide-in 0.15s ease;
    }
    .securepass-gen-settings label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      cursor: pointer;
      color: #cbd5e1;
    }
    .securepass-gen-settings input[type="range"] {
      width: 100%;
      margin: 4px 0 8px 0;
      accent-color: #3b82f6;
    }
    .securepass-gen-settings input[type="checkbox"] {
      accent-color: #3b82f6;
    }
  `;
  shadowRoot.appendChild(style);

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
    // Use fixed positioning — already fixed in CSS, so top/left are viewport coords
    const top = rect.top + rect.height / 2 - 14; // 14 = half of 28px button height
    const left = rect.right - 36; // 36 = button width (28) + 8px margin
    button.style.top = `${Math.max(0, top)}px`;
    button.style.left = `${Math.max(0, left)}px`;
  }

  function positionPanel(panel, field) {
    const rect = field.getBoundingClientRect();
    // Use fixed positioning — top/left are viewport coords directly
    let top = rect.bottom + 8;
    let left = rect.left;

    // Clamp right overflow
    if (left + 320 > window.innerWidth) {
      left = window.innerWidth - 328;
    }
    // Clamp bottom overflow — if panel would go off screen, show above the field
    const panelH = panel.offsetHeight || 250;
    if (top + panelH > window.innerHeight) {
      top = Math.max(8, rect.top - panelH - 8);
    }

    panel.style.top = `${Math.max(8, top)}px`;
    panel.style.left = `${Math.max(8, left)}px`;
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
      <div class="securepass-section securepass-autofill-section" style="display:none; margin-top: ${isLogin ? '0' : '12px'}; padding-top: ${isLogin ? '0' : '12px'}; border-top: ${isLogin ? 'none' : '1px solid rgba(255,255,255,0.1)'};">
        <h3 style="margin-bottom: 8px; font-size:0.75rem; color:#94a3b8;">Saved Credentials</h3>
        <div class="autofill-list" style="display:flex; flex-direction:column; gap:6px;"></div>
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
        positionPanel(panel, field);
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

    // Autofill section
    chrome.runtime.sendMessage({ type: 'LIST_CREDENTIALS' }, response => {
      if (chrome.runtime.lastError) return;
      if (response && response.ok && response.unlocked && response.entries) {
        const host = window.location.hostname;
        const matches = response.entries.filter(e => {
          try {
             const savedHost = new URL(e.site).hostname;
             return savedHost === host || host.endsWith('.' + savedHost) || savedHost.endsWith('.' + host);
          } catch {
             return e.site === host || host.endsWith('.' + e.site) || e.site.endsWith('.' + host);
          }
        });

        if (matches.length > 0) {
          const section = panel.querySelector('.securepass-autofill-section');
          const list = section.querySelector('.autofill-list');
          section.style.display = 'block';
          matches.forEach(m => {
             const btn = document.createElement('button');
             btn.type = 'button';
             btn.className = 'autofill-btn';
             btn.innerHTML = `
               <div class="autofill-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
               <div>
                  <div style="font-weight:600;">${m.username || 'No username'}</div>
                  <div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;">${host}</div>
               </div>
             `;
             
             btn.addEventListener('click', () => {
                field.value = m.password;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                
                let userFilled = false;
                if (m.username) {
                  if (constraints.usernameField) {
                     constraints.usernameField.value = m.username;
                     constraints.usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                     userFilled = true;
                  }
                  // Backup heuristic
                  if (!userFilled) {
                    const form = field.form || field.closest('form');
                    if (form) {
                      const userField = Array.from(form.elements).find(el => {
                        if (el === field) return false;
                        return el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email' || el.name.toLowerCase().includes('user') || el.name.toLowerCase().includes('email'));
                      }) || document.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
                      if (userField) {
                        userField.value = m.username;
                        userField.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                    }
                  }
                }
                statusEl.textContent = 'Autofilled successfully!';
                statusEl.style.color = '#22c55e';
                setTimeout(() => {
                  cleanup();
                  if (AUTO_SUBMIT_ENABLED && field.form) {
                    try {
                      field.form.requestSubmit();
                    } catch (e) {
                      try { field.form.submit(); } catch (e2) {}
                    }
                  }
                }, 1000);
             });
             list.appendChild(btn);
          });
          setTimeout(() => positionPanel(panel, field), 10);
        } else if (isLogin) {
          statusEl.textContent = 'No saved passwords for this site.';
        }
      } else if (isLogin) {
         statusEl.innerHTML = 'Vault is locked. <a href="#" style="color:#60a5fa" id="open-ext-login">Unlock</a>';
         const link = statusEl.querySelector('#open-ext-login');
         if(link) {
           link.addEventListener('click', (e) => {
             e.preventDefault();
             statusEl.textContent = 'Please open the extension from toolbar.';
           });
         }
      }
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
      if (path.includes(panel) || path.includes(button)) return;
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
