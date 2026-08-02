export function mapScoreToColor(score) {
  if (score >= 0.8) return 'linear-gradient(90deg,#22c55e,#16a34a)';
  if (score >= 0.6) return 'linear-gradient(90deg,#84cc16,#22c55e)';
  if (score >= 0.4) return 'linear-gradient(90deg,#facc15,#f97316)';
  return 'linear-gradient(90deg,#ef4444,#dc2626)';
}

export function positionFloating(button, field) {
  const rect = field.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    button.style.opacity = '0';
    button.style.pointerEvents = 'none';
    return;
  }
  button.style.opacity = '';
  button.style.pointerEvents = '';
  const top = rect.top + rect.height / 2 - 13; // 13 = half of 26px button
  let left = rect.right + 4;
  if (left + 26 > window.innerWidth) {
    left = rect.right - 32;
  }
  button.style.top = `${Math.max(0, top)}px`;
  button.style.left = `${Math.max(0, left)}px`;
}

export function positionPanel(panel, field) {
  if (panel.dataset.positioned) return;
  const rect = field.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;

  if (left + 320 > window.innerWidth) {
    left = window.innerWidth - 328;
  }
  const maxH = 460;
  if (top + maxH > window.innerHeight) {
    top = Math.max(6, rect.top - maxH - 6);
  }

  panel.style.top = `${Math.max(6, top)}px`;
  panel.style.left = `${Math.max(6, left)}px`;
  panel.dataset.positioned = '1';
}

export function setupShadowDom() {
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
  return { shadowHost, shadowRoot };
}

export async function resolveThemeClass() {
  try {
    const storage = await import(chrome.runtime.getURL('src/utils/storage.js'));
    const syncInfo = await storage.getStorage('local', 'settingsSync');
    const area = syncInfo?.settingsSync?.useSync ? 'sync' : 'local';
    const stored = await storage.getStorage(area, 'settings');
    const theme = stored?.settings?.theme || 'system';
    if (theme === 'dark') return 'sp-dark';
    if (theme === 'light') return 'sp-light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sp-dark' : 'sp-light';
  } catch {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sp-dark' : 'sp-light';
  }
}

export function updateAllThemes(shadowRoot) {
  resolveThemeClass().then(cls => {
    shadowRoot.querySelectorAll('.securepass-panel').forEach(panel => {
      panel.classList.remove('sp-dark', 'sp-light');
      panel.classList.add(cls);
    });
  });
}

export async function initThemeSync(shadowRoot) {
  const storageModule = await import(chrome.runtime.getURL('src/utils/storage.js'));
  storageModule.onStorageChanged((changes, areaName) => {
    if (areaName === 'local' && changes.settingsSync) updateAllThemes(shadowRoot);
    if (changes.settings) updateAllThemes(shadowRoot);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => updateAllThemes(shadowRoot));
}
