import { state, resetInactivityTimer } from '../popup.js';
import { updateStrength } from './tester.js';
import { showToast } from './toast.js';
import { resolveUnlockSetup } from './vault.js';

const viewTabs = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const modalBackdrop = document.getElementById('modalBackdrop');
const settingsPanel = document.getElementById('settingsPanel');
const entryModal = document.getElementById('entryModal');
const masterModal = document.getElementById('masterModal');
const unlockSetupModal = document.getElementById('unlockSetupModal');

export function setView(viewId) {
  views.forEach(v => v.classList.remove('active'));
  viewTabs.forEach(t => t.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewId}`);
  const targetTab = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (targetView) targetView.classList.add('active');
  if (targetTab) {
    targetTab.classList.add('active');
    requestAnimationFrame(() => {
      const indicator = document.getElementById('navIndicator');
      if (indicator) {
        indicator.style.width = `${targetTab.offsetWidth}px`;
        indicator.style.transform = `translateX(${targetTab.offsetLeft - 4}px)`;
      }
    });
  }
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
  const { clearEntryForm } = await import('./vault.js');
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
  const curr = document.getElementById('currentMaster');
  const newp = document.getElementById('newMaster');
  const conf = document.getElementById('confirmNewMaster');
  if (curr) curr.value = '';
  if (newp) newp.value = '';
  if (conf) conf.value = '';
  openModal('masterModal');
}

export function attachUIListeners() {
  viewTabs.forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

  modalBackdrop.addEventListener('click', () => {
    closeModal('entryModal');
    closeModal('masterModal');
    closeModal('unlockSetupModal');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('entryModal');
      closeModal('masterModal');
      closeModal('unlockSetupModal');
      closeSettingsPanel();
    }
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

  const openSettingsBtn = document.getElementById('openSettings');
  const closeSettingsBtn = document.getElementById('closeSettings');
  const settingsPanel = document.getElementById('settingsPanel');
  
  if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettingsPanel);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsPanel);
  if (settingsPanel) settingsPanel.addEventListener('click', event => {
    if (event.target === settingsPanel) closeSettingsPanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settingsPanel && settingsPanel.getAttribute('aria-hidden') === 'false') {
      closeSettingsPanel();
    }
  });
}
