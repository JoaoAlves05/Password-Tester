(async () => {
  const shadowHost = document.createElement('div');
  shadowHost.id = 'securepass-extension-root';
  shadowHost.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647; overflow: visible;';
  document.body.appendChild(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .securepass-floating {
      pointer-events: auto;
      position: absolute;
      z-index: 2147483646;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      border: none;
      background: rgba(255, 255, 255, 0.8);
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.2);
      backdrop-filter: blur(12px);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: transform 0.2s ease, opacity 0.2s ease, background 0.2s ease;
    }
    .securepass-floating svg {
      width: 16px;
      height: 16px;
      color: #0f172a;
    }
    .securepass-floating--active {
      background: rgba(37, 99, 235, 0.15);
    }
    .securepass-panel {
      pointer-events: auto;
      position: absolute;
      z-index: 2147483647;
      width: 320px;
      border-radius: 18px;
      padding: 16px;
      background: rgba(15, 23, 42, 0.86);
      color: #f8fafc;
      box-shadow: 0 25px 60px rgba(2, 6, 23, 0.55);
      backdrop-filter: blur(18px);
      font-family: 'Inter', system-ui, sans-serif;
    }
    .securepass-panel h3 {
      margin: 0 0 4px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .securepass-panel .securepass-meter {
      height: 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.25);
      overflow: hidden;
      margin-bottom: 6px;
    }
    .securepass-panel .securepass-meter div {
      height: 100%;
      width: 6%;
      border-radius: inherit;
      background: #ef4444;
      transition: width 0.3s ease, background 0.3s ease;
    }
    .securepass-panel .securepass-meta {
      font-size: 0.75rem;
      display: flex;
      justify-content: space-between;
      color: rgba(226, 232, 240, 0.85);
      margin-bottom: 6px;
    }
    .securepass-panel ul {
      margin: 0;
      padding-left: 1rem;
      max-height: 90px;
      overflow-y: auto;
      font-size: 0.75rem;
    }
    .securepass-panel .securepass-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .securepass-panel .securepass-actions button {
      flex: 1;
      border: none;
      border-radius: 10px;
      background: rgba(148, 163, 184, 0.25);
      color: #f8fafc;
      padding: 6px 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .securepass-panel .securepass-status {
      font-size: 0.7rem;
      margin-top: 6px;
      color: rgba(248, 250, 252, 0.75);
    }
  `;
  shadowRoot.appendChild(style);

  const [{ observePasswordFields }, passwordModule] = await Promise.all([
    import(chrome.runtime.getURL('src/formAnalyzer.js')),
    import(chrome.runtime.getURL('src/passwordStrength.js'))
  ]);

  const tracked = new Map();

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
      return;
    }
    const top = rect.top + window.scrollY + rect.height / 2 - button.offsetHeight / 2;
    const left = rect.right + window.scrollX + 8;
    button.style.opacity = '1';
    button.style.top = `${Math.max(0, top)}px`;
    button.style.left = `${left}px`;
  }

  function positionPanel(panel, field) {
    const rect = field.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 10;
    const left = rect.left + window.scrollX;
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }

  function updatePanel(panel, password) {
    const { score, verdict, entropy, suggestions } = passwordModule.evaluatePassword(password);
    panel.querySelector('.securepass-meter div').style.width = `${Math.max(score * 100, 6)}%`;
    panel.querySelector('.securepass-meter div').style.background = mapScoreToColor(score);
    panel.querySelector('.securepass-verdict').textContent = verdict;
    panel.querySelector('.securepass-entropy').textContent = `${entropy} bits`;
    const list = panel.querySelector('ul');
    list.innerHTML = '';
    suggestions.forEach(tip => {
      const li = document.createElement('li');
      li.textContent = tip;
      list.appendChild(li);
    });
    if (!suggestions.length) {
      const li = document.createElement('li');
      li.textContent = 'Looking strong. Keep it memorable.';
      list.appendChild(li);
    }
  }

  function createPanel(field, constraints, button) {
    const panel = document.createElement('div');
    panel.className = 'securepass-panel';
    panel.innerHTML = `
      <h3>SecurePass insight</h3>
      <div class="securepass-meter"><div></div></div>
      <div class="securepass-meta">
        <span class="securepass-verdict">Weak</span>
        <span class="securepass-entropy">0 bits</span>
      </div>
      <ul></ul>
      <div class="securepass-autofill-section" style="display:none; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <h3 style="margin-bottom: 4px;">Autofill</h3>
        <div class="autofill-list" style="display:flex; flex-direction:column; gap:4px;"></div>
      </div>
      <div class="securepass-actions">
        <button type="button" class="securepass-generate">Generate</button>
        <button type="button" class="securepass-hibp">HIBP</button>
      </div>
      <div class="securepass-status"></div>
    `;
    shadowRoot.appendChild(panel);
    updatePanel(panel, field.value);
    positionPanel(panel, field);

    const statusEl = panel.querySelector('.securepass-status');
    const generateBtn = panel.querySelector('.securepass-generate');
    const hibpBtn = panel.querySelector('.securepass-hibp');

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
             btn.textContent = m.username || 'No username';
             btn.style.cssText = 'background: rgba(37, 99, 235, 0.25); border: none; border-radius: 6px; color: #f8fafc; padding: 4px 8px; font-size: 0.75rem; cursor: pointer; text-align: left; transition: background 0.2s ease;';
             btn.addEventListener('mouseover', () => btn.style.background = 'rgba(37, 99, 235, 0.45)');
             btn.addEventListener('mouseout', () => btn.style.background = 'rgba(37, 99, 235, 0.25)');
             btn.addEventListener('click', () => {
                field.value = m.password;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                
                if (m.username) {
                  const form = field.form || field.closest('form');
                  if (form) {
                    const userField = Array.from(form.elements).find(el => {
                      if (el === field) return false;
                      const isTextInput = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email' || el.name.toLowerCase().includes('user') || el.name.toLowerCase().includes('email'));
                      return isTextInput;
                    }) || document.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
                    
                    if (userField) {
                      userField.value = m.username;
                      userField.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                  } else {
                    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"]'));
                    for(const inp of inputs) {
                      if (inp !== field && inp.getBoundingClientRect().top < field.getBoundingClientRect().top) {
                         inp.value = m.username;
                         inp.dispatchEvent(new Event('input', { bubbles: true }));
                         break;
                      }
                    }
                  }
                }
                statusEl.textContent = 'Autofilled!';
             });
             list.appendChild(btn);
          });
          setTimeout(() => positionPanel(panel, field), 10);
        }
      }
    });

    const ro = new ResizeObserver(() => {
      positionPanel(panel, field);
    });
    ro.observe(field);

    const scrollHandler = () => positionPanel(panel, field);
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', scrollHandler);

    const inputHandler = () => {
      updatePanel(panel, field.value);
      statusEl.textContent = '';
    };
    field.addEventListener('input', inputHandler);

    const outsideHandler = event => {
      const path = event.composedPath();
      if (path.includes(panel) || path.includes(button)) return;
      cleanup();
    };
    document.addEventListener('click', outsideHandler, true);

    generateBtn.addEventListener('click', async () => {
      generateBtn.disabled = true;
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GENERATE_PASSWORD', constraints }, res => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res);
        });
      });
      generateBtn.disabled = false;
      if (!response || !response.ok) {
        statusEl.textContent = response?.error || 'Unable to generate password.';
        return;
      }
      field.value = response.password;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      updatePanel(panel, field.value);
      statusEl.textContent = 'Generated password applied.';
    });

    hibpBtn.addEventListener('click', async () => {
      hibpBtn.disabled = true;
      statusEl.textContent = 'Checking HIBP…';
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'HIBP_CHECK', password: field.value }, res => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res);
        });
      });
      hibpBtn.disabled = false;
      if (!response || !response.ok) {
        statusEl.textContent = response?.error || 'HIBP check failed.';
        return;
      }
      statusEl.textContent = response.result?.compromised
        ? `Breached ${response.result.count.toLocaleString()} times`
        : 'Not found in breaches';
    });

    const cleanup = () => {
      document.removeEventListener('click', outsideHandler, true);
      window.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', scrollHandler);
      field.removeEventListener('input', inputHandler);
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
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2l7 4v8c0 4-3 7-7 8-4-1-7-4-7-8V6l7-4z"></path>
        <path d="M9 12l2 2 4-4"></path>
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
