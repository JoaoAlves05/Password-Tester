import { sendMessage } from './modules/messaging.js';
import { showToast, initToast } from './modules/toast.js';
import { applyTheme } from './modules/theme.js';
import { attachGeneratorListeners, syncGeneratorControls } from './modules/generator.js';
import { attachTesterListeners, updateStrength } from './modules/tester.js';
import { attachSettingsListeners, syncSettingsView } from './modules/settings.js';
import {
  renderEntries, handleEntrySubmit, handleUnlock, handleCreateMaster,
  changeMasterPassword, ensureVaultAccessible, lockVault, resolveUnlockSetup
} from './modules/vault.js';
import { loadSettings } from '../src/settings.js';
import { onStorageChanged, getStorage } from '../src/utils/storage.js';
import { logger } from '../src/logger.js';
import { base64ToBuffer, bufferToBase64 } from '../src/encoding.js';

export const ICONS = {
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`
};

export const state = {
  settings: null,
  passphrase: null,
  vaultUnlocked: false,
  vaultInitialized: null,
  entries: [],
  filter: '',
  inactivityTimer: null,
  editingEntryId: null,
  generatorPassword: ''
};

// DOM Elements
const viewTabs = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const modalBackdrop = document.getElementById('modalBackdrop');
const settingsPanel = document.getElementById('settingsPanel');
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const addEntryBtn = document.getElementById('addEntry');
const changeMasterBtn = document.getElementById('changeMasterKeyBtn');
const lockVaultBtn = document.getElementById('lockVault');
const vaultSearch = document.getElementById('vaultSearch');
const searchToggle = document.getElementById('searchToggle');
const searchContainer = document.querySelector('.search-container');
const biometricUnlockBtn = document.getElementById('biometricUnlockBtn');
const biometricInlineAuth = document.getElementById('biometricInlineAuth');
const biometricInlinePassword = document.getElementById('biometricInlinePassword');
const biometricInlineCancel = document.getElementById('biometricInlineCancel');
const biometricInlineConfirm = document.getElementById('biometricInlineConfirm');
const exportVaultBtn = document.getElementById('exportVault');
const importVaultBtn = document.getElementById('importVaultBtn');
const importVaultFile = document.getElementById('importVaultFile');
const clearVaultBtn = document.getElementById('clearVault');
const unlockSetupModal = document.getElementById('unlockSetupModal');
const unlockSetupForm = document.getElementById('unlockSetupForm');
const unlockSetupPassword = document.getElementById('unlockSetupPassword');
const entryModal = document.getElementById('entryModal');
const masterModal = document.getElementById('masterModal');
const vaultLockedPanel = document.getElementById('vaultLocked');
const vaultUnlockedPanel = document.getElementById('vaultUnlocked');
const createMasterSection = document.getElementById('createMaster');
const unlockMasterSection = document.getElementById('unlockMaster');
const biometricUnlockContainer = document.getElementById('biometricUnlockContainer');

initToast(document.getElementById('toast'));

export function sanitizeValue(value, maxLength, noSpaces = false) {
  if (typeof value !== 'string') return '';
  let clean = value.substring(0, maxLength);
  if (noSpaces) clean = clean.replace(/\s+/g, '');
  return clean.replace(/[<>]/g, ''); // Basic anti-XSS
}

export function resetInactivityTimer() {
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
  if (!state.settings || !state.vaultUnlocked) return;
  const timeoutMs = (state.settings.vaultTimeout || 15) * 60 * 1000;
  state.inactivityTimer = setTimeout(() => {
    lockVault(true);
  }, timeoutMs);
}

export function setView(viewId) {
  views.forEach(v => v.classList.remove('active'));
  viewTabs.forEach(t => t.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewId}`);
  const targetTab = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (targetView) targetView.classList.add('active');
  if (targetTab) targetTab.classList.add('active');
  if (viewId === 'tester' && state.generatorPassword) {
    updateStrength(state.generatorPassword);
  }
}

export function openSettingsPanel() {
  settingsPanel.classList.add('visible');
  settingsPanel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeSettingsPanel() {
  document.activeElement?.blur();
  settingsPanel.classList.remove('visible');
  settingsPanel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

export function openModal(id) {
  const modalMap = { entryModal, masterModal, unlockSetupModal };
  const modal = modalMap[id];
  if (!modal) return;
  modalBackdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  const focusTarget = modal.querySelector('input, textarea, button');
  if (focusTarget) setTimeout(() => focusTarget.focus(), 10);
}

export function closeModal(id) {
  const modalMap = { entryModal, masterModal, unlockSetupModal };
  const modal = modalMap[id];
  if (!modal) return;

  if (id === 'unlockSetupModal') resolveUnlockSetup(null);

  if (!modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
  }
  if (!entryModal.classList.contains('hidden') || !masterModal.classList.contains('hidden') || !unlockSetupModal.classList.contains('hidden')) {
    return;
  }
  modalBackdrop.classList.add('hidden');
}

export async function detectActiveOrigin() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      const url = new URL(tabs[0].url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.hostname;
      }
    }
  } catch {}
  return '';
}

export async function openEntryModal(entry = null) {
  if (state.vaultUnlocked) {
    resetInactivityTimer();
  } else {
    showToast('Unlock the vault first to continue.', 'warning');
    setView('vault');
    return;
  }
  state.editingEntryId = entry ? entry.id : null;
  document.getElementById('entryModalTitle').textContent = entry ? 'Update credential' : 'Save credential';
  const { clearEntryForm } = await import('./modules/vault.js');
  clearEntryForm();

  const siteInput = document.getElementById('entrySite');
  const userInput = document.getElementById('entryUsername');
  const passInput = document.getElementById('entryPassword');
  const noteInput = document.getElementById('entryNotes');

  if (entry) {
    if (siteInput) siteInput.value = entry.site || '';
    if (userInput) userInput.value = entry.username || '';
    if (passInput) passInput.value = entry.password || '';
    if (noteInput) noteInput.value = entry.notes || '';
  } else {
    if (passInput) passInput.value = state.generatorPassword || document.getElementById('passwordInput')?.value || '';
    if (siteInput && !siteInput.value) siteInput.value = await detectActiveOrigin();
  }
  openModal('entryModal');
  resetInactivityTimer();
}

export function openMasterModal() {
  if (state.vaultUnlocked) {
    resetInactivityTimer();
  } else {
    showToast('Unlock the vault first to continue.', 'warning');
    setView('vault');
    return;
  }
  document.getElementById('masterForm')?.reset();
  openModal('masterModal');
  resetInactivityTimer();
}

export function renderVaultState() {
  const showLocked = !state.vaultUnlocked;
  if (vaultLockedPanel) vaultLockedPanel.classList.toggle('hidden', !showLocked);
  if (vaultUnlockedPanel) vaultUnlockedPanel.classList.toggle('hidden', showLocked);
  if (createMasterSection) createMasterSection.classList.toggle('hidden', state.vaultInitialized !== false);
  if (unlockMasterSection) unlockMasterSection.classList.toggle('hidden', !state.vaultInitialized);
  
  if (!state.vaultUnlocked && state.vaultInitialized) {
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

function attachGlobalListeners() {
  viewTabs.forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

  modalBackdrop.addEventListener('click', () => {
    closeModal('entryModal');
    closeModal('masterModal');
    closeModal('unlockSetupModal');
  });

  document.querySelectorAll('[data-close]')?.forEach(button => {
    button.addEventListener('click', event => closeModal(event.currentTarget.getAttribute('data-close')));
  });

  document.querySelectorAll('.modal-header .icon-button').forEach(button => {
    button.addEventListener('click', event => {
      const modal = event.target.closest('.modal');
      if (modal) closeModal(modal.id);
    });
  });

  document.querySelectorAll('[data-toggle-target]')?.forEach(button => {
    button.addEventListener('click', event => {
      const targetId = event.currentTarget.getAttribute('data-toggle-target');
      const target = document.getElementById(targetId);
      if (target) {
        const isExpanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
        event.currentTarget.setAttribute('aria-expanded', String(!isExpanded));
        target.hidden = isExpanded;
      }
    });
  });

  openSettingsBtn.addEventListener('click', openSettingsPanel);
  closeSettingsBtn.addEventListener('click', closeSettingsPanel);
  settingsPanel.addEventListener('click', event => {
    if (event.target === settingsPanel) closeSettingsPanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settingsPanel.getAttribute('aria-hidden') === 'false') {
      closeSettingsPanel();
    }
  });

  addEntryBtn.addEventListener('click', () => openEntryModal());
  if (changeMasterBtn) changeMasterBtn.addEventListener('click', () => openMasterModal());
  lockVaultBtn.addEventListener('click', () => lockVault(true));

  vaultSearch.addEventListener('input', event => {
    state.filter = event.target.value;
    renderEntries();
    resetInactivityTimer();
  });

  searchToggle.addEventListener('click', () => {
    const isActive = searchContainer.classList.contains('active');
    if (isActive) {
      searchContainer.classList.remove('active');
      vaultSearch.value = '';
      state.filter = '';
      renderEntries();
    } else {
      searchContainer.classList.add('active');
      setTimeout(() => vaultSearch.focus(), 300);
    }
  });

  const entryForm = document.getElementById('entryForm');
  if (entryForm) entryForm.addEventListener('submit', handleEntrySubmit);
  const unlockForm = document.getElementById('unlockForm');
  if (unlockForm) unlockForm.addEventListener('submit', handleUnlock);
  const createMasterForm = document.getElementById('createMasterForm');
  if (createMasterForm) createMasterForm.addEventListener('submit', handleCreateMaster);
  const masterForm = document.getElementById('masterForm');
  if (masterForm) masterForm.addEventListener('submit', changeMasterPassword);
  if (unlockSetupForm) {
    unlockSetupForm.addEventListener('submit', event => {
      event.preventDefault();
      const passphrase = (unlockSetupPassword?.value || '').trim();
      if (!passphrase) {
        showToast('Master password is required.', 'warning');
        return;
      }
      resolveUnlockSetup(passphrase);
      if (!unlockSetupModal.classList.contains('hidden')) unlockSetupModal.classList.add('hidden');
      if (entryModal.classList.contains('hidden') && masterModal.classList.contains('hidden')) {
        modalBackdrop.classList.add('hidden');
      }
    });
  }
}

async function loadVaultStatus() {
  const response = await sendMessage('VAULT_STATUS');
  if (!response?.ok) return;
  state.vaultInitialized = response.status?.initialized ?? false;
  if (response.status?.unlocked) {
    state.vaultUnlocked = true;
    state.passphrase = null;
    renderVaultState();
    const listRes = await sendMessage('LIST_CREDENTIALS');
    if (listRes?.ok && listRes.unlocked) {
      state.entries = listRes.entries || [];
      renderEntries();
    } else {
      await lockVault();
    }
    resetInactivityTimer();
  } else {
    state.vaultUnlocked = false;
    state.passphrase = null;
    renderVaultState();
  }
}

async function initialise() {
  state.settings = await loadSettings();
  if (!state.settings.theme) state.settings.theme = 'system';
  applyTheme(state.settings.theme);

  attachGeneratorListeners();
  attachTesterListeners();
  attachSettingsListeners();
  attachGlobalListeners();

  syncGeneratorControls();
  
  const copyTestPasswordBtn = document.getElementById('copyTestPassword');
  const copyGeneratedBtn = document.getElementById('copyGenerated');
  const useForTestBtn = document.getElementById('useForTest');
  if (copyTestPasswordBtn) {
    copyTestPasswordBtn.innerHTML = ICONS.copy;
    copyTestPasswordBtn.setAttribute('aria-label', 'Copy password');
  }
  if (copyGeneratedBtn) {
    copyGeneratedBtn.innerHTML = ICONS.copy;
    copyGeneratedBtn.setAttribute('aria-label', 'Copy generated password');
  }
  if (useForTestBtn) {
    useForTestBtn.innerHTML = ICONS.arrowRight;
    useForTestBtn.setAttribute('aria-label', 'Send to tester');
  }
  if (lockVaultBtn) {
    lockVaultBtn.innerHTML = ICONS.lock;
    lockVaultBtn.setAttribute('aria-label', 'Lock vault');
  }

  await loadVaultStatus();
  setView('tester');

  onStorageChanged((changes, area) => {
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
