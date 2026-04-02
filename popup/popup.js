import { evaluatePassword } from '../src/passwordStrength.js';
import { loadSettings, saveSettings } from '../src/settings.js';

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const ICONS = {
  sun:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"></line><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"></line></svg>',
  moon:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 14.5A8.38 8.38 0 0 1 12.5 3 6.5 6.5 0 1 0 21 14.5z"></path></svg>',
  eye:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  eyeOff:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-6.88"></path><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.16 4.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  arrowRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="11" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>'
};

const passwordInput = document.getElementById('passwordInput');
const strengthBar = document.getElementById('strengthBar');
const strengthVerdict = document.getElementById('strengthVerdict');
const entropyEl = document.getElementById('entropy');
const crackTimeEl = document.getElementById('crackTime');
const suggestionsList = document.getElementById('suggestionsList');
const suggestionsEmpty = document.getElementById('suggestionsEmpty');
const hibpStatus = document.getElementById('hibpStatus');
const hibpButton = document.getElementById('checkHibp');
const togglePasswordBtn = document.getElementById('togglePassword');
const copyTestPasswordBtn = document.getElementById('copyTestPassword');
// const themeToggle = document.getElementById('themeToggle'); // Removed in new UI
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const settingsPanel = document.getElementById('settingsPanel');
const themeRadios = document.querySelectorAll('input[name="appearanceTheme"]');
const autoLockRange = document.getElementById('autoLockRange');
const autoLockLabel = document.getElementById('autoLockLabel');
const syncToggle = document.getElementById('syncToggle');
const clipboardRange = document.getElementById('clipboardRange');
const clipboardLabel = document.getElementById('clipboardLabel');
const hibpCacheRange = document.getElementById('hibpCacheRange');
const hibpCacheLabel = document.getElementById('hibpCacheLabel');
const defaultLengthRange = document.getElementById('defaultLengthRange');
const defaultLengthLabel = document.getElementById('defaultLengthLabel');
const defaultUpper = document.getElementById('defaultUpper');
const defaultLower = document.getElementById('defaultLower');
const defaultNumbers = document.getElementById('defaultNumbers');
const defaultSymbols = document.getElementById('defaultSymbols');
const exportVaultBtn = document.getElementById('exportVault');
const importVaultBtn = document.getElementById('importVaultBtn');
const importVaultFile = document.getElementById('importVaultFile');
const clearVaultBtn = document.getElementById('clearVault');
const toastEl = document.getElementById('toast');
const viewTabs = document.querySelectorAll('.nav-item');
const navIndicator = document.getElementById('navIndicator');
const TAB_ORDER = ['generator', 'tester', 'vault'];
const views = {
  generator: document.getElementById('view-generator'),
  tester: document.getElementById('view-tester'),
  vault: document.getElementById('view-vault')
};

const lengthRange = document.getElementById('lengthRange');
const lengthValue = document.getElementById('lengthValue');
const includeLower = document.getElementById('includeLower');
const includeUpper = document.getElementById('includeUpper');
const includeNumbers = document.getElementById('includeNumbers');
const includeSymbols = document.getElementById('includeSymbols');
const avoidSimilar = document.getElementById('avoidSimilar');
const generatorStatus = document.getElementById('generatorStatus');
const generateButton = document.getElementById('generatePassword');
const generatedResult = document.getElementById('generatedResult');
const copyGeneratedBtn = document.getElementById('copyGenerated');
const useForTestBtn = document.getElementById('useForTest');
const saveGeneratedBtn = document.getElementById('saveGenerated');
const saveTestedBtn = document.getElementById('saveTested');

const vaultLockedPanel = document.getElementById('vaultLocked');
const vaultUnlockedPanel = document.getElementById('vaultUnlocked');
const createMasterSection = document.getElementById('createMaster');
const unlockMasterSection = document.getElementById('unlockMaster');
const biometricUnlockContainer = document.getElementById('biometricUnlockContainer');
const biometricUnlockBtn = document.getElementById('biometricUnlockBtn');
const createMasterForm = document.getElementById('createMasterForm');
const unlockForm = document.getElementById('unlockForm');
const vaultPassphraseInput = document.getElementById('vaultPassphrase');
const newMasterInput = document.getElementById('newMaster');
const confirmMasterInput = document.getElementById('confirmMaster');
const vaultList = document.getElementById('vaultList');
const vaultEmpty = document.getElementById('vaultEmpty');
const vaultSearch = document.getElementById('vaultSearch');
const searchToggle = document.getElementById('searchToggle');
const searchContainer = document.querySelector('.search-container');
const addEntryBtn = document.getElementById('addEntry');
const changeMasterBtn = document.getElementById('changeMaster');
const lockVaultBtn = document.getElementById('lockVault');

const modalBackdrop = document.getElementById('modalBackdrop');
const entryModal = document.getElementById('entryModal');
const entryForm = document.getElementById('entryForm');
const entryModalTitle = document.getElementById('entryModalTitle');
const entrySiteInput = document.getElementById('entrySite');
const entryUsernameInput = document.getElementById('entryUsername');
const entryPasswordInput = document.getElementById('entryPassword');
const entryNotesInput = document.getElementById('entryNotes');

const masterModal = document.getElementById('masterModal');
const masterForm = document.getElementById('masterForm');
const currentMasterInput = document.getElementById('currentMaster');
const nextMasterInput = document.getElementById('nextMaster');
const confirmNextMasterInput = document.getElementById('confirmNextMaster');

const THEMES = ['system', 'dark', 'light'];
const revealTimers = new Map();
let settingsSaveTimeout = null;

const state = {
  settings: null,
  vaultUnlocked: false,
  vaultInitialized: null,
  passphrase: null,
  entries: [],
  filter: '',
  generatorPassword: '',
  inactivityTimer: null,
  currentView: 'tester',
  editingEntryId: null,
  biometricAutoTriggered: false
};

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.body.dataset.theme = resolved;
  updateThemeToggleIcon();
}

function scheduleSettingsSave() {
  if (!state.settings) return;
  clearTimeout(settingsSaveTimeout);
  settingsSaveTimeout = setTimeout(() => {
    saveSettings(state.settings).catch(() => {
      showToast('Unable to save preferences.', 'warning');
    });
  }, 250);
}

function showToast(message, variant = 'info') {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('visible', 'success', 'error', 'warning');
  if (variant !== 'info') {
    toastEl.classList.add(variant);
  }
  requestAnimationFrame(() => {
    toastEl.classList.add('visible');
  });
  setTimeout(() => {
    toastEl.classList.remove('visible', 'success', 'error', 'warning');
  }, 3200);
}

function mapScoreToColor(score) {
  if (score >= 0.8) return 'linear-gradient(90deg, #22c55e, #16a34a)';
  if (score >= 0.6) return 'linear-gradient(90deg, #84cc16, #16a34a)';
  if (score >= 0.4) return 'linear-gradient(90deg, #f97316, #f59e0b)';
  return 'linear-gradient(90deg, #ef4444, #dc2626)';
}

function scoreToBadge(score) {
  if (score >= 0.75) return 'badge-strong';
  if (score >= 0.45) return 'badge-medium';
  return 'badge-weak';
}

function updateStrength(password) {
  const { score, verdict, entropy, crackTime, suggestions } = evaluatePassword(password);
  if (strengthBar) {
    strengthBar.style.width = `${Math.max(score * 100, 6)}%`;
    strengthBar.style.background = mapScoreToColor(score);
  }
  if (strengthVerdict) {
    strengthVerdict.textContent = verdict;
    strengthVerdict.classList.remove('badge-weak', 'badge-medium', 'badge-strong');
    strengthVerdict.classList.add(scoreToBadge(score));
  }
  if (entropyEl) entropyEl.textContent = `Entropy: ${entropy} bits`;
  if (crackTimeEl) crackTimeEl.textContent = `Crack time: ${crackTime}`;

  if (suggestionsList) {
    suggestionsList.innerHTML = '';
    if (suggestions.length) {
      if (suggestionsEmpty) suggestionsEmpty.classList.add('hidden');
      suggestionsList.classList.add('visible');
      suggestions.forEach(tip => {
        const li = document.createElement('li');
        li.textContent = tip;
        suggestionsList.appendChild(li);
      });
    } else {
      suggestionsList.classList.remove('visible');
      if (suggestionsEmpty) suggestionsEmpty.classList.remove('hidden');
    }
  }

  const tipsToggle = document.querySelector('[data-toggle-target="tipsContent"]');
  const tipsContent = document.getElementById('tipsContent');
  if (tipsToggle && tipsContent) {
    const wasExpanded = tipsToggle.getAttribute('aria-expanded') === 'true';
    if (suggestions.length) {
      if (!wasExpanded) {
        toggleCollapsible(tipsToggle);
        tipsToggle.dataset.autoOpened = 'true';
      }
    } else {
      if (tipsToggle.dataset.autoOpened === 'true' && wasExpanded) {
        toggleCollapsible(tipsToggle);
      }
      delete tipsToggle.dataset.autoOpened;
    }
  }
}

function toggleCollapsible(button) {
  if (!button) return;
  const targetId = button.getAttribute('data-toggle-target');
  if (!targetId) return;
  const target = document.getElementById(targetId);
  if (!target) return;
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  const nextState = !isExpanded;
  button.setAttribute('aria-expanded', String(nextState));
  target.hidden = !nextState;
  updateToggleLabel(button, nextState);
}

function updateToggleLabel(button, expanded = false) {
  if (!button) return;
  const labels = button.dataset.labels ? button.dataset.labels.split('|').map(label => label.trim()) : null;
  if (labels && labels.length === 2) {
    button.textContent = expanded ? labels[1] : labels[0];
  }
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.loading = loading;
}

function updateThemeToggleIcon() {
  // Deprecated in favor of radio buttons
}

function updatePasswordToggleIcon() {
  if (!togglePasswordBtn || !passwordInput) return;
  const isHidden = passwordInput.type === 'password';
  togglePasswordBtn.innerHTML = isHidden ? ICONS.eye : ICONS.eyeOff;
  togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Show password' : 'Hide password');
}

function setupPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.togglePassword;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      button.innerHTML = isHidden ? ICONS.eyeOff : ICONS.eye;
      button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  });
}

function syncSettingsView() {
  if (!state.settings) return;
  themeRadios.forEach(radio => {
    radio.checked = radio.value === state.settings.theme;
  });
  const timeout = state.settings.vaultTimeout || 15;
  autoLockRange.value = timeout;
  autoLockLabel.textContent = `${timeout} min`;
  syncToggle.checked = Boolean(state.settings.useSync);

  const clipboardTimeout = state.settings.clipboardTimeout || 30;
  if (clipboardRange) clipboardRange.value = clipboardTimeout;
  if (clipboardLabel) clipboardLabel.textContent = clipboardTimeout === 0 ? 'Never' : `${clipboardTimeout}s`;

  const hibpCache = state.settings.hibpCacheTtlHours || 24;
  if (hibpCacheRange) hibpCacheRange.value = hibpCache;
  if (hibpCacheLabel) hibpCacheLabel.textContent = hibpCache === 1 ? '1 hour' : `${hibpCache} hours`;

  if (state.settings.generatorDefaults) {
    const defs = state.settings.generatorDefaults;
    if (defaultLengthRange) {
      defaultLengthRange.value = defs.length || 16;
      if (defaultLengthLabel) defaultLengthLabel.textContent = defs.length || 16;
    }
    if (defaultUpper) defaultUpper.checked = defs.uppercase !== false;
    if (defaultLower) defaultLower.checked = defs.lowercase !== false;
    if (defaultNumbers) defaultNumbers.checked = defs.numbers !== false;
    if (defaultSymbols) defaultSymbols.checked = defs.symbols !== false;
  }

  updateThemeToggleIcon();
}

function openSettingsPanel() {
  if (!settingsPanel) return;
  settingsPanel.setAttribute('aria-hidden', 'false');
  // Move focus to the close button for accessibility
  closeSettingsBtn?.focus();
}

function closeSettingsPanel() {
  if (!settingsPanel) return;
  // Move focus back to the trigger button BEFORE hiding the panel
  // This prevents the "aria-hidden element contains focus" error
  openSettingsBtn?.focus();
  settingsPanel.setAttribute('aria-hidden', 'true');
}

async function sendMessage(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, response => {
      if (chrome.runtime.lastError) {
        return resolve({ ok: false, error: chrome.runtime.lastError.message });
      }
      resolve(response || { ok: false, error: 'No response from background.' });
    });
  });
}

async function copyToClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);

    const timeout = state.settings?.clipboardTimeout ?? 30;
    if (timeout > 0) {
      // Delegate clearing to background service worker (via alarms)
      // so it persists even if popup is closed
      await sendMessage('SCHEDULE_CLIPBOARD_CLEAR', { timeout });
    }

    return true;
  } catch (error) {
    return false;
  }
}

function updateNavIndicator(activeTab) {
  if (!navIndicator || !activeTab) return;
  const nav = activeTab.parentElement;
  const navRect = nav.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  const navPadding = parseFloat(getComputedStyle(nav).paddingLeft) || 4;
  const offsetX = tabRect.left - navRect.left - navPadding;
  navIndicator.style.width = tabRect.width + 'px';
  navIndicator.style.transform = `translateX(${offsetX}px)`;
}

function setView(view) {
  if (!views[view]) return;
  const oldView = state.currentView;
  const oldIndex = TAB_ORDER.indexOf(oldView);
  const newIndex = TAB_ORDER.indexOf(view);
  state.currentView = view;

  // Update tab active states
  let activeTabEl = null;
  viewTabs.forEach(tab => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) activeTabEl = tab;
  });

  // Slide the pill indicator
  updateNavIndicator(activeTabEl);

  // Directional content slide
  const goingRight = newIndex > oldIndex;
  Object.entries(views).forEach(([key, section]) => {
    if (!section) return;
    const isTarget = key === view;
    // Remove old direction class
    section.classList.remove('slide-right');
    if (!isTarget) {
      // Exiting view: set the exit direction
      if (goingRight) {
        // Old content exits to the left (default translateX(-20px))
      } else {
        // Old content exits to the right
        section.classList.add('slide-right');
      }
    } else {
      // Entering view: come from the opposite direction
      if (goingRight) {
        section.classList.add('slide-right');
      }
      // Force a reflow so the browser picks up the starting position
      void section.offsetWidth;
      section.classList.remove('slide-right');
    }
    section.classList.toggle('active', isTarget);
  });
}

function resetInactivityTimer() {
  if (!state.vaultUnlocked) return;
  
  // Notify background to keep session alive
  sendMessage('KEEP_ALIVE').catch(() => {});

  const minutes = state.settings?.vaultTimeout || 15;
  clearTimeout(state.inactivityTimer);
  state.inactivityTimer = setTimeout(async () => {
    await lockVault();
    showToast('Vault locked after inactivity.', 'warning');
  }, minutes * 60 * 1000);
}

async function detectActiveOrigin() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      return new URL(tab.url).origin;
    }
  } catch (error) {
    // ignore
  }
  return '';
}

function clearRevealTimer(id) {
  const timer = revealTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    revealTimers.delete(id);
  }
}

function hidePasswordReveal(container, button, id) {
  if (!container) return;
  container.classList.add('hidden');
  container.textContent = '';
  if (button) {
    button.innerHTML = ICONS.eye;
    button.setAttribute('aria-label', 'Reveal password');
  }
  if (id) clearRevealTimer(id);
}

function createVaultIconButton(icon, label, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `vault-icon-btn${extraClass ? ` ${extraClass}` : ''}`;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  return button;
}

function renderVaultEntries() {
  if (!state.vaultUnlocked) {
    if (vaultList) vaultList.innerHTML = '';
    if (vaultEmpty) vaultEmpty.classList.add('hidden');
    return;
  }
  const query = state.filter.toLowerCase();
  const filtered = state.entries
    .slice()
    .filter(entry => {
      if (!query) return true;
      return (
        entry.site.toLowerCase().includes(query) ||
        entry.username.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const siteCompare = a.site.localeCompare(b.site, undefined, { sensitivity: 'base' });
      if (siteCompare !== 0) return siteCompare;
      return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
    });

  if (vaultList) vaultList.innerHTML = '';
  if (!filtered.length) {
    if (vaultEmpty) vaultEmpty.classList.remove('hidden');
    return;
  }
  if (vaultEmpty) vaultEmpty.classList.add('hidden');

  filtered.forEach(entry => {
    const item = document.createElement('li');
    item.className = 'vault-item';
    item.dataset.id = entry.id;

    const header = document.createElement('div');
    header.className = 'vault-item-header';

    const title = document.createElement('h3');
    title.className = 'vault-site';
    title.textContent = entry.site || 'Untitled';
    header.appendChild(title);

    const date = document.createElement('span');
    date.className = 'vault-date';
    const updated = new Date(entry.updatedAt || entry.createdAt);
    date.textContent = updated.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    header.appendChild(date);

    item.appendChild(header);

    if (entry.username) {
      const row = document.createElement('div');
      row.className = 'vault-row';
      const username = document.createElement('div');
      username.className = 'vault-username';
      
      const userSVG = document.createElement('div');
      userSVG.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="user-icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
      
      const userSpan = document.createElement('span');
      userSpan.textContent = entry.username;
      
      username.appendChild(userSVG.firstChild);
      username.appendChild(document.createTextNode(' '));
      username.appendChild(userSpan);
      
      row.appendChild(username);
      item.appendChild(row);
    }

    // Password Row
    const passRow = document.createElement('div');
    passRow.className = 'vault-row';
    const passwordContainer = document.createElement('div');
    passwordContainer.className = 'vault-password';

    // Key Icon
    const keyIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="user-icon"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;

    const passText = document.createElement('span');
    passText.className = 'vault-password-text';
    passText.textContent = '••••••••••••';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'vault-password-toggle';
    toggleBtn.title = 'Show password';
    toggleBtn.innerHTML = ICONS.eye;

    let isRevealed = false;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetInactivityTimer();
      isRevealed = !isRevealed;

      if (isRevealed) {
        passText.textContent = entry.password;
        toggleBtn.innerHTML = ICONS.eyeOff;
        toggleBtn.title = 'Hide password';
        clearRevealTimer(entry.id);
        const timer = setTimeout(() => {
          isRevealed = false;
          passText.textContent = '••••••••••••';
          toggleBtn.innerHTML = ICONS.eye;
          toggleBtn.title = 'Show password';
        }, 10000); // 10s auto-hide
        revealTimers.set(entry.id, timer);
      } else {
        passText.textContent = '••••••••••••';
        toggleBtn.innerHTML = ICONS.eye;
        toggleBtn.title = 'Show password';
        clearRevealTimer(entry.id);
      }
    });

    passwordContainer.innerHTML = keyIcon;
    passwordContainer.appendChild(passText);
    passwordContainer.appendChild(toggleBtn);
    passRow.appendChild(passwordContainer);
    item.appendChild(passRow);

    if (entry.notes) {
      const notes = document.createElement('div');
      notes.className = 'vault-notes';
      notes.textContent = entry.notes;
      item.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'vault-actions';

    // Copy Button
    const copyBtn = createVaultIconButton(ICONS.copy, 'Copy password');
    copyBtn.addEventListener('click', async () => {
      resetInactivityTimer();
      const ok = await copyToClipboard(entry.password);
      showToast(ok ? 'Password copied to clipboard.' : 'Unable to copy password.', ok ? 'success' : 'warning');
    });

    const editBtn = createVaultIconButton(ICONS.edit, 'Edit credential');
    editBtn.addEventListener('click', () => {
      openEntryModal(entry);
    });

    const deleteBtn = createVaultIconButton(ICONS.trash, 'Delete credential', 'danger');
    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this credential from the vault?');
      if (!confirmed) return;
      await deleteCredential(entry.id);
    });

    actions.append(copyBtn, editBtn, deleteBtn);
    item.appendChild(actions);
    vaultList.appendChild(item);
  });
}

function renderVaultState() {
  const showLocked = !state.vaultUnlocked;
  if (vaultLockedPanel) vaultLockedPanel.classList.toggle('hidden', !showLocked);
  if (vaultUnlockedPanel) vaultUnlockedPanel.classList.toggle('hidden', showLocked);
  if (createMasterSection) createMasterSection.classList.toggle('hidden', state.vaultInitialized !== false);
  if (unlockMasterSection) unlockMasterSection.classList.toggle('hidden', !state.vaultInitialized);
  
  if (!state.vaultUnlocked && state.vaultInitialized) {
    // Check if biometric is enabled to show the unlock option
    sendMessage('BIOMETRIC_STATUS').then(res => {
      if (res?.enabled) {
        biometricUnlockContainer?.classList.remove('hidden');
      } else {
        biometricUnlockContainer?.classList.add('hidden');
      }
    });

    if (vaultSearch) vaultSearch.value = '';
    if (searchContainer) searchContainer.classList.remove('active');
    state.filter = '';
    state.entries = [];
  }
}

function clearEntryForm() {
  entryForm.reset();
  entrySiteInput.value = '';
  entryUsernameInput.value = '';
  entryPasswordInput.value = '';
  entryNotesInput.value = '';
}

function closeModal(id) {
  const modal = id === 'entryModal' ? entryModal : masterModal;
  if (!modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
  }
  if (!entryModal.classList.contains('hidden') || !masterModal.classList.contains('hidden')) {
    return;
  }
  modalBackdrop.classList.add('hidden');
  modalBackdrop.classList.add('hidden');
}

function openModal(id) {
  modalBackdrop.classList.remove('hidden');
  const modal = id === 'entryModal' ? entryModal : masterModal;
  modal.classList.remove('hidden');
  const focusTarget = modal.querySelector('input, textarea, button');
  if (focusTarget) {
    setTimeout(() => focusTarget.focus(), 10);
  }
}

async function openEntryModal(entry = null) {
  if (!requireUnlockedVault()) return;
  state.editingEntryId = entry ? entry.id : null;
  entryModalTitle.textContent = entry ? 'Update credential' : 'Save credential';
  clearEntryForm();
  if (entry) {
    entrySiteInput.value = entry.site || '';
    entryUsernameInput.value = entry.username || '';
    entryPasswordInput.value = entry.password || '';
    entryNotesInput.value = entry.notes || '';
  } else {
    entryPasswordInput.value = state.generatorPassword || passwordInput.value;
    if (!entrySiteInput.value) {
      entrySiteInput.value = await detectActiveOrigin();
    }
  }
  openModal('entryModal');
  resetInactivityTimer();
}

function openMasterModal() {
  if (!requireUnlockedVault()) return;
  masterForm.reset();
  openModal('masterModal');
  resetInactivityTimer();
}

function requireUnlockedVault() {
  if (state.vaultUnlocked && state.passphrase) {
    resetInactivityTimer();
    return true;
  }
  showToast('Unlock the vault first to continue.', 'warning');
  setView('vault');
  return false;
}

async function lockVault(showMessage = false) {
  await sendMessage('LOCK_VAULT');
  state.vaultUnlocked = false;
  state.passphrase = null;
  state.entries = [];
  clearTimeout(state.inactivityTimer);
  renderVaultState();
  renderVaultEntries();
  if (showMessage) {
    showToast('Vault locked.', 'info');
  }
}

async function refreshVaultEntries() {
  if (!state.vaultUnlocked) return;
  const response = await sendMessage('LIST_CREDENTIALS');
  if (!response?.ok) {
    return;
  }
  if (!response.unlocked) {
    await lockVault();
    return;
  }
  state.entries = response.entries || [];
  renderVaultEntries();
}

async function deleteCredential(id) {
  if (!requireUnlockedVault()) return;
  const response = await sendMessage('DELETE_CREDENTIAL', {
    id,
    passphrase: state.passphrase
  });
  if (!response?.ok) {
    showToast(response?.error || 'Unable to delete credential.', 'error');
    return;
  }
  showToast('Credential removed from vault.', 'success');
  await refreshVaultEntries();
  resetInactivityTimer();
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  if (!requireUnlockedVault()) return;
  const site = entrySiteInput.value.trim();
  const username = entryUsernameInput.value.trim();
  const password = entryPasswordInput.value.trim();
  const notes = entryNotesInput.value.trim();

  if (!site) {
    showToast('Website or app is required.', 'warning');
    entrySiteInput.focus();
    return;
  }
  if (!password) {
    showToast('Password is required.', 'warning');
    entryPasswordInput.focus();
    return;
  }

  const payload = {
    site,
    username,
    password,
    notes
  };

  let response;
  if (state.editingEntryId) {
    response = await sendMessage('UPDATE_CREDENTIAL', {
      id: state.editingEntryId,
      updates: payload,
      passphrase: state.passphrase
    });
  } else {
    response = await sendMessage('STORE_CREDENTIAL', {
      entry: payload,
      passphrase: state.passphrase
    });
  }

  if (!response?.ok) {
    showToast(response?.error || 'Unable to save credential.', 'error');
    return;
  }

  closeModal('entryModal');
  showToast(state.editingEntryId ? 'Credential updated.' : 'Credential saved to vault.', 'success');
  state.editingEntryId = null;
  await refreshVaultEntries();
  resetInactivityTimer();
}

async function handleUnlock(event) {
  event.preventDefault();
  const passphrase = vaultPassphraseInput.value.trim();
  if (!passphrase) return;
  const timeoutMinutes = state.settings?.vaultTimeout || 15;
  const response = await sendMessage('UNLOCK_VAULT', { passphrase, timeoutMinutes });
  if (!response?.ok) {
    showToast(response?.error || 'Unable to unlock vault.', 'error');
    return;
  }
  state.passphrase = passphrase;
  state.vaultUnlocked = true;
  state.vaultInitialized = true;
  vaultPassphraseInput.value = '';
  state.entries = response.data?.entries || [];
  renderVaultState();
  renderVaultEntries();
  resetInactivityTimer();
  showToast('Vault unlocked.', 'success');
}

async function handleCreateMaster(event) {
  event.preventDefault();
  const master = newMasterInput.value.trim();
  const confirm = confirmMasterInput.value.trim();
  if (!master || !confirm) {
    showToast('Enter and confirm the master password.', 'warning');
    return;
  }
  if (master !== confirm) {
    showToast('Master passwords do not match.', 'error');
    return;
  }
  const initResponse = await sendMessage('INITIALIZE_VAULT', { passphrase: master });
  if (!initResponse?.ok) {
    showToast(initResponse?.error || 'Unable to initialise vault.', 'error');
    return;
  }
  if (initResponse.created === false) {
    state.vaultInitialized = true;
    renderVaultState();
    showToast('Vault already exists. Unlock it with your master password.', 'warning');
    return;
  }
  const timeoutMinutes = state.settings?.vaultTimeout || 15;
  const unlockResponse = await sendMessage('UNLOCK_VAULT', { passphrase: master, timeoutMinutes });
  newMasterInput.value = '';
  confirmMasterInput.value = '';
  if (!unlockResponse?.ok) {
    state.vaultInitialized = true;
    renderVaultState();
    showToast('Vault created. Unlock with your new master password.', 'success');
    return;
  }
  state.passphrase = master;
  state.vaultInitialized = true;
  state.vaultUnlocked = true;
  state.entries = unlockResponse.data?.entries || [];
  renderVaultState();
  renderVaultEntries();
  resetInactivityTimer();
  showToast('Vault created and unlocked.', 'success');
}

async function loadVaultStatus() {
  const response = await sendMessage('VAULT_STATUS');
  if (!response?.ok) return;
  state.vaultInitialized = response.status?.initialized ?? false;
  if (response.status?.unlocked) {
    // Vault is unlocked in the service worker. For security we do not restore
    // the plaintext passphrase into the popup automatically. Sensitive actions
    // will require the user to re-enter the master password or use biometric unlock.
    state.vaultUnlocked = true;
    state.passphrase = null;
    renderVaultState();
    await refreshVaultEntries();
    resetInactivityTimer();
  } else {
    state.vaultUnlocked = false;
    state.passphrase = null;
    renderVaultState();
  }
}

function syncGeneratorControls() {
  if (!state.settings) return;
  if (state.settings.generatorDefaults) {
    const defs = state.settings.generatorDefaults;
    if (lengthRange) lengthRange.value = defs.length || 16;
    if (lengthValue) lengthValue.textContent = defs.length || 16;
    if (includeLower) includeLower.checked = defs.lowercase !== false;
    if (includeUpper) includeUpper.checked = defs.uppercase !== false;
    if (includeNumbers) includeNumbers.checked = defs.numbers !== false;
    if (includeSymbols) includeSymbols.checked = defs.symbols !== false;
  } else {
    if (lengthRange) lengthRange.value = state.settings.minLength;
    if (lengthValue) lengthValue.textContent = state.settings.minLength;
    if (includeLower) includeLower.checked = state.settings.includeLowercase;
    if (includeUpper) includeUpper.checked = state.settings.includeUppercase;
    if (includeNumbers) includeNumbers.checked = state.settings.includeNumbers;
    if (includeSymbols) includeSymbols.checked = state.settings.includeSymbols;
  }
  if (avoidSimilar) avoidSimilar.checked = state.settings.avoidSimilar;
  syncSettingsView();
}

async function handleGenerate() {
  setLoading(generateButton, true);
  generatorStatus.textContent = '';
  const constraints = {
    length: Number(lengthRange.value),
    overrides: {
      minLength: Number(lengthRange.value),
      includeLowercase: includeLower.checked,
      includeUppercase: includeUpper.checked,
      includeNumbers: includeNumbers.checked,
      includeSymbols: includeSymbols.checked,
      avoidSimilar: avoidSimilar.checked
    }
  };
  const response = await sendMessage('GENERATE_PASSWORD', { constraints });
  setLoading(generateButton, false);
  if (!response?.ok) {
    generatorStatus.textContent = response?.error || 'Could not generate password.';
    generatorStatus.classList.remove('success');
    generatorStatus.classList.add('error');
    return;
  }
  state.generatorPassword = response.password;
  generatedResult.value = response.password;
  updateStrength(response.password);
  generatorStatus.textContent = 'Strong password generated.';
  generatorStatus.classList.remove('error');
  generatorStatus.classList.add('success');
  showToast('New password generated.', 'success');
}

async function saveGeneratedToVault() {
  if (!generatedResult.value) {
    showToast('Generate a password first.', 'warning');
    return;
  }
  await openEntryModal({
    id: null,
    site: await detectActiveOrigin(),
    username: '',
    password: generatedResult.value,
    notes: ''
  });
}

async function saveTestedToVault() {
  if (!passwordInput.value) {
    showToast('Enter a password first.', 'warning');
    return;
  }
  await openEntryModal({
    id: null,
    site: await detectActiveOrigin(),
    username: '',
    password: passwordInput.value,
    notes: ''
  });
}

async function changeMasterPassword(event) {
  event.preventDefault();
  if (!requireUnlockedVault()) return;
  const current = currentMasterInput.value.trim();
  const next = nextMasterInput.value.trim();
  const confirm = confirmNextMasterInput.value.trim();
  if (!current || !next || !confirm) {
    showToast('Complete all fields.', 'warning');
    return;
  }
  if (next !== confirm) {
    showToast('New master passwords do not match.', 'error');
    return;
  }
  const response = await sendMessage('CHANGE_MASTER_PASSWORD', {
    oldPassphrase: current,
    newPassphrase: next
  });
  if (!response?.ok) {
    showToast(response?.error || 'Unable to change master password.', 'error');
    return;
  }
  state.passphrase = next;
  closeModal('masterModal');
  resetInactivityTimer();
  showToast('Master password updated.', 'success');
}

function attachEventListeners() {
  passwordInput.addEventListener('input', event => {
    updateStrength(event.target.value);
    hibpStatus.textContent = 'Not checked yet.';
    hibpStatus.className = 'text-muted';
  });

  togglePasswordBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    updatePasswordToggleIcon();
  });

  copyTestPasswordBtn.addEventListener('click', async () => {
    if (!passwordInput.value) {
      showToast('Enter a password first.', 'warning');
      return;
    }
    const ok = await copyToClipboard(passwordInput.value);
    showToast(ok ? 'Password copied.' : 'Clipboard unavailable.', ok ? 'success' : 'warning');
  });

  hibpButton.addEventListener('click', async () => {
    if (!passwordInput.value) {
      showToast('Enter a password to check.', 'warning');
      return;
    }
    setLoading(hibpButton, true);
    hibpStatus.textContent = 'Checking…';
    hibpStatus.className = 'text-muted';
    const response = await sendMessage('HIBP_CHECK', { password: passwordInput.value });
    setLoading(hibpButton, false);
    if (!response?.ok) {
      hibpStatus.textContent = response?.error || 'Could not check breaches.';
      hibpStatus.className = 'text-warning';
      return;
    }
    if (response.result?.compromised) {
      hibpStatus.innerHTML = `<strong class="breach-count">${response.result.count.toLocaleString()}</strong> breaches found`;
      hibpStatus.className = 'text-default';
      showToast(`Password found in ${response.result.count.toLocaleString()} breaches!`, 'error');
    } else {
      hibpStatus.textContent = 'No known breaches found.';
      hibpStatus.className = 'text-success';
      showToast('Password not found in breaches.', 'success');
    }
  });

  generateButton.addEventListener('click', handleGenerate);

  lengthRange.addEventListener('input', event => {
    lengthValue.textContent = event.target.value;
  });

  const generatorToggles = [includeLower, includeUpper, includeNumbers, includeSymbols, avoidSimilar];
  generatorToggles.forEach(inputEl => {
    inputEl.addEventListener('change', () => {
      if (!state.settings) return;
      state.settings.includeLowercase = includeLower.checked;
      state.settings.includeUppercase = includeUpper.checked;
      state.settings.includeNumbers = includeNumbers.checked;
      state.settings.includeSymbols = includeSymbols.checked;
      state.settings.avoidSimilar = avoidSimilar.checked;
      scheduleSettingsSave();
    });
  });

  lengthRange.addEventListener('change', () => {
    if (!state.settings) return;
    state.settings.minLength = Number(lengthRange.value);
    scheduleSettingsSave();
  });

  copyGeneratedBtn.addEventListener('click', async () => {
    if (!generatedResult.value) {
      showToast('Generate a password first.', 'warning');
      return;
    }
    const ok = await copyToClipboard(generatedResult.value);
    showToast(ok ? 'Generated password copied.' : 'Clipboard unavailable.', ok ? 'success' : 'warning');
  });

  useForTestBtn.addEventListener('click', () => {
    if (!generatedResult.value) {
      showToast('Generate a password first.', 'warning');
      return;
    }
    passwordInput.value = generatedResult.value;
    updateStrength(generatedResult.value);
    setView('tester');
    passwordInput.focus();
  });

  saveGeneratedBtn.addEventListener('click', saveGeneratedToVault);
  if (saveTestedBtn) {
    saveTestedBtn.addEventListener('click', saveTestedToVault);
  }

  createMasterForm.addEventListener('submit', handleCreateMaster);
  unlockForm.addEventListener('submit', handleUnlock);
  if (biometricUnlockBtn) {
    biometricUnlockBtn.addEventListener('click', async () => {
      biometricUnlockBtn.disabled = true;
      const span = biometricUnlockBtn.querySelector('span');
      const originalText = span.textContent;
      span.textContent = 'Authenticating...';

      try {
        // 1. Get current biometric credential info from background
        const statusRes = await sendMessage('BIOMETRIC_STATUS');
        if (!statusRes?.enabled) throw new Error('Biometric unlock is not enabled.');

        // 2. Start biometric session in background
        const startRes = await sendMessage('BIOMETRIC_AUTH_START', { credentialId: null });
        if (!startRes?.ok) throw new Error(startRes?.error || 'Failed to start biometric auth');

        // 3. Trigger native dialog directly from extension popup
        // Note: we can do this here because popup is extension origin
        const bioDataRes = await chrome.storage.local.get('securepassBiometric');
        const b = bioDataRes.securepassBiometric;
        if (!b) throw new Error('Stored biometric data not found.');

        const rpId = chrome.runtime.id;
        const challenge = crypto.getRandomValues(new Uint8Array(32));

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId,
            allowCredentials: [{ 
              type: 'public-key', 
              id: base64ToBuffer(b.credentialId),
              transports: ['internal']
            }],
            userVerification: 'required',
            extensions: {
              prf: { eval: { first: new TextEncoder().encode('securepass-master-key-v1') } },
            },
          },
        });

        const prfResults = assertion.getClientExtensionResults()?.prf?.results;
        const prfOutput  = prfResults?.first ? bufferToBase64(prfResults.first) : null;

        // 4. Send PRF results to background to complete unlock
        const completeRes = await sendMessage('BIOMETRIC_AUTH_COMPLETE', {
          sessionId: startRes.sessionId,
          prfOutput,
          prfAvailable: !!prfOutput
        });

        if (completeRes?.ok) {
          showToast('Vault unlocked!', 'success');
          await loadVaultStatus();
        } else {
          throw new Error(completeRes?.error || 'Authentication failed');
        }
      } catch (err) {
        console.error('Biometric Unlock Error:', err);
        if (err.name !== 'NotAllowedError') {
          showToast(err.message || 'Biometric authentication failed.', 'error');
        }
      } finally {
        biometricUnlockBtn.disabled = false;
        span.textContent = originalText;
      }
    });
  }
  entryForm.addEventListener('submit', handleEntrySubmit);
  masterForm.addEventListener('submit', changeMasterPassword);

  modalBackdrop.addEventListener('click', () => {
    closeModal('entryModal');
    closeModal('masterModal');
  });

  document.querySelectorAll('[data-close]')?.forEach(button => {
    button.addEventListener('click', event => {
      const target = event.currentTarget.getAttribute('data-close');
      closeModal(target);
    });
  });

  document.querySelectorAll('.modal-header .icon-button').forEach(button => {
    button.addEventListener('click', event => {
      const modal = event.target.closest('.modal');
      if (modal) {
        closeModal(modal.id === 'entryModal' ? 'entryModal' : 'masterModal');
      }
    });
  });

  document.querySelectorAll('[data-toggle-target]')?.forEach(button => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    updateToggleLabel(button, expanded);
    button.addEventListener('click', event => {
      delete event.currentTarget.dataset.autoOpened;
      toggleCollapsible(event.currentTarget);
    });
  });

  addEntryBtn.addEventListener('click', () => openEntryModal());
  if (changeMasterBtn) changeMasterBtn.addEventListener('click', () => openMasterModal());
  lockVaultBtn.addEventListener('click', () => lockVault(true));

  vaultSearch.addEventListener('input', event => {
    state.filter = event.target.value;
    renderVaultEntries();
    resetInactivityTimer();
  });

  searchToggle.addEventListener('click', () => {
    const isActive = searchContainer.classList.contains('active');
    if (isActive) {
      searchContainer.classList.remove('active');
      vaultSearch.value = '';
      state.filter = '';
      renderVaultEntries();
    } else {
      searchContainer.classList.add('active');
      setTimeout(() => vaultSearch.focus(), 300);
    }
  });

  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      setView(tab.dataset.view);
    });
  });

  /*
  themeToggle.addEventListener('click', async () => {
    if (!state.settings) return;
    const currentIndex = THEMES.indexOf(state.settings.theme || 'system');
    const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
    state.settings.theme = nextTheme;
    applyTheme(nextTheme);
    await saveSettings(state.settings);
  });
  */

  openSettingsBtn.addEventListener('click', () => openSettingsPanel());
  closeSettingsBtn.addEventListener('click', () => closeSettingsPanel());
  settingsPanel.addEventListener('click', event => {
    if (event.target === settingsPanel) {
      closeSettingsPanel();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settingsPanel.getAttribute('aria-hidden') === 'false') {
      closeSettingsPanel();
    }
  });

  themeRadios.forEach(radio => {
    radio.addEventListener('change', async event => {
      if (!event.target.checked || !state.settings) return;
      state.settings.theme = event.target.value;
      applyTheme(event.target.value);
      await saveSettings(state.settings);
      syncSettingsView();
    });
  });

  autoLockRange.addEventListener('input', event => {
    autoLockLabel.textContent = `${event.target.value} min`;
  });

  autoLockRange.addEventListener('change', () => {
    if (!state.settings) return;
    state.settings.vaultTimeout = Number(autoLockRange.value);
    scheduleSettingsSave();
  });

  syncToggle.addEventListener('change', async () => {
    if (!state.settings) return;
    state.settings.useSync = syncToggle.checked;
    await saveSettings(state.settings);
  });

  // New Settings Listeners
  if (clipboardRange) {
    clipboardRange.addEventListener('input', () => {
      const val = Number(clipboardRange.value);
      clipboardLabel.textContent = val === 0 ? 'Never' : `${val}s`;
      state.settings.clipboardTimeout = val;
      scheduleSettingsSave();
    });
  }

  if (hibpCacheRange) {
    hibpCacheRange.addEventListener('input', () => {
      const val = Number(hibpCacheRange.value);
      hibpCacheLabel.textContent = val === 1 ? '1 hour' : `${val} hours`;
      state.settings.hibpCacheTtlHours = val;
      scheduleSettingsSave();
    });
  }

  if (defaultLengthRange) {
    defaultLengthRange.addEventListener('input', () => {
      const val = Number(defaultLengthRange.value);
      defaultLengthLabel.textContent = val;
      if (!state.settings.generatorDefaults) state.settings.generatorDefaults = {};
      state.settings.generatorDefaults.length = val;
      scheduleSettingsSave();
    });
  }

  [defaultUpper, defaultLower, defaultNumbers, defaultSymbols].forEach(cb => {
    if (cb) {
      cb.addEventListener('change', () => {
        if (!state.settings.generatorDefaults) state.settings.generatorDefaults = {};
        state.settings.generatorDefaults.uppercase = defaultUpper.checked;
        state.settings.generatorDefaults.lowercase = defaultLower.checked;
        state.settings.generatorDefaults.numbers = defaultNumbers.checked;
        state.settings.generatorDefaults.symbols = defaultSymbols.checked;
        scheduleSettingsSave();
      });
    }
  });

  // Change Master Key (from Settings page)
  const changeMasterKeyBtn = document.getElementById('changeMasterKeyBtn');
  if (changeMasterKeyBtn) {
    changeMasterKeyBtn.addEventListener('click', () => {
      openModal('masterModal');
    });
  }

  // Biometric Unlock Setup / Disable
  const biometricSetupBtn = document.getElementById('biometricSetupBtn');
  const biometricBtnLabel = document.getElementById('biometricBtnLabel');
  const biometricBtnSub   = document.getElementById('biometricBtnSub');

  async function refreshBiometricBtn() {
    if (!biometricSetupBtn) return;
    biometricSetupBtn.style.display = '';
    
    // Get status even if locked
    const res = await sendMessage('BIOMETRIC_STATUS');
    
    if (!state.vaultUnlocked) {
      biometricBtnLabel.textContent = res?.enabled ? 'Biometric Unlock Active' : 'Set up Biometric Unlock';
      biometricBtnSub.textContent   = 'Unlock vault first to make changes';
      biometricSetupBtn.classList.remove('danger');
      return;
    }

    if (res?.enabled) {
      biometricBtnLabel.textContent = 'Disable Biometric Unlock';
      biometricBtnSub.textContent   = res.prfAvailable
        ? 'Active · PRF encryption enabled'
        : 'Active · Session-based (re-enter password after restart)';
      biometricSetupBtn.classList.add('danger');
    } else {
      biometricBtnLabel.textContent = 'Set up Biometric Unlock';
      biometricBtnSub.textContent   = 'Use fingerprint, Face ID or device PIN';
      biometricSetupBtn.classList.remove('danger');
    }
  }

  if (biometricSetupBtn) {
    biometricSetupBtn.addEventListener('click', async () => {
      const statusRes = await sendMessage('BIOMETRIC_STATUS');
      if (statusRes?.enabled) {
        // Disable
        if (!confirm('Disable biometric unlock? You will need to enter your master password each time.')) return;
        const disableRes = await sendMessage('DISABLE_BIOMETRIC');
        if (disableRes?.ok) {
          showToast('Biometric unlock disabled.', 'success');
          await refreshBiometricBtn();
        } else {
          showToast('Could not disable biometrics.', 'error');
        }
      } else {
        // Setup: vault must be unlocked
        if (!requireUnlockedVault()) return;
        showToast('Confirma a tua identidade no sistema (Touch ID, PIN, etc.).', 'info');
        try {
          const rpId = chrome.runtime.id;
          const challenge = crypto.getRandomValues(new Uint8Array(32));
          
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
          
          const res = await sendMessage('BIOMETRIC_REGISTER_COMPLETE', {
            credentialId: bufferToBase64(credential.rawId),
            prfOutput,
            prfAvailable: !!prfOutput,
            passphrase: state.passphrase
          });

          if (res?.ok) {
            showToast('Biometria configurada com sucesso!', 'success');
            await refreshBiometricBtn();
          } else {
            showToast(res?.error || 'Erro ao configurar biometria.', 'error');
          }
        } catch (err) {
          if (err.name === 'NotAllowedError') {
            showToast('Configuração biométrica cancelada.', 'info');
          } else {
            showToast('Erro: ' + err.message, 'error');
          }
        }
      }
    });
  }

  // Refresh biometric button state when settings panel opens
  const origOpenSettings = openSettingsPanel;
  // Wrap openSettingsPanel to also refresh biometric state
  openSettingsBtn?.addEventListener('click', () => refreshBiometricBtn());

  // Reset Settings
  const resetSettingsBtn = document.getElementById('resetSettings');

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) return;

      // Reset to defaults
      const defaults = {
        theme: 'system',
        minLength: 16,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true,
        avoidSimilar: true,
        vaultTimeout: 15,
        hibpCacheTtlHours: 24,
        useSync: false,
        clipboardTimeout: 30,
        generatorDefaults: {
          length: 16,
          uppercase: true,
          lowercase: true,
          numbers: true,
          symbols: true
        }
      };

      state.settings = defaults;
      await saveSettings(state.settings);
      applyTheme(state.settings.theme);
      syncSettingsView();
      showToast('Settings reset to defaults.', 'success');
    });
  }

  if (exportVaultBtn) {
    exportVaultBtn.addEventListener('click', async () => {
      if (!requireUnlockedVault()) return;
      const response = await sendMessage('LIST_CREDENTIALS');
      if (response?.entries) {
        const blob = new Blob([JSON.stringify(response.entries, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `password-tester-vault-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Vault exported successfully.', 'success');
      } else {
        showToast('Failed to export vault.', 'error');
      }
    });
  }

  if (importVaultBtn) {
    importVaultBtn.addEventListener('click', () => {
      if (!requireUnlockedVault()) return;
      importVaultFile.click();
    });
  }

  if (importVaultFile) {
    importVaultFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const entries = JSON.parse(event.target.result);
          if (!Array.isArray(entries)) throw new Error('Invalid format');

          let count = 0;
          for (const entry of entries) {
            if (entry.site && entry.password) {
              const { id, ...data } = entry;
              await sendMessage('STORE_CREDENTIAL', {
                entry: data,
                passphrase: state.passphrase
              });
              count++;
            }
          }
          showToast(`Imported ${count} entries.`, 'success');
          await refreshVaultEntries();
        } catch (err) {
          showToast('Invalid JSON file.', 'error');
        }
        importVaultFile.value = '';
      };
      reader.readAsText(file);
    });
  }

  if (clearVaultBtn) {
    clearVaultBtn.addEventListener('click', async () => {
      if (!requireUnlockedVault()) return;
      const confirmed = window.confirm('DANGER: This will permanently delete ALL entries in your vault. This action cannot be undone.\n\nAre you sure?');
      if (confirmed) {
        const response = await sendMessage('LIST_CREDENTIALS');
        if (response?.entries) {
          for (const entry of response.entries) {
            await sendMessage('DELETE_CREDENTIAL', {
              id: entry.id,
              passphrase: state.passphrase
            });
          }
          showToast('Vault cleared.', 'success');
          await refreshVaultEntries();
        }
      }
    });
  }
}

async function initialise() {
  state.settings = await loadSettings();
  if (!state.settings.theme) {
    state.settings.theme = 'system';
  }
  applyTheme(state.settings.theme);
  if (state.settings.theme === 'system' && window.matchMedia) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => applyTheme(state.settings.theme));
  }
  syncGeneratorControls();
  updateStrength('');
  updatePasswordToggleIcon();
  copyTestPasswordBtn.innerHTML = ICONS.copy;
  copyTestPasswordBtn.setAttribute('aria-label', 'Copy password');
  copyGeneratedBtn.innerHTML = ICONS.copy;
  copyGeneratedBtn.setAttribute('aria-label', 'Copy generated password');
  useForTestBtn.innerHTML = ICONS.arrowRight;
  useForTestBtn.setAttribute('aria-label', 'Send to tester');
  lockVaultBtn.innerHTML = ICONS.lock;
  lockVaultBtn.setAttribute('aria-label', 'Lock vault');
  attachEventListeners();
  setupPasswordToggles();
  await loadVaultStatus();
  setView('tester');

  // Listen for settings changes from Options page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' || area === 'local') {
      loadSettings().then(settings => {
        state.settings = settings;
        applyTheme(state.settings.theme);
        syncSettingsView();
        syncGeneratorControls();
      });
    }
  });
}

initialise();
