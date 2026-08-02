import { sendMessage } from './messaging.js';
import { showToast } from './toast.js';
import { state, resetInactivityTimer, renderVaultState, renderVaultEntries, setView, openModal, closeModal, sanitizeValue, detectActiveOrigin, ICONS } from '../popup.js';
import { copyToClipboard } from '../../src/utils/clipboard.js';

const vaultList = document.getElementById('vaultList');
const vaultEmptyPanel = document.getElementById('vaultEmptyPanel');
const vaultLockedPanel = document.getElementById('vaultLockedPanel');
const vaultUnlockedPanel = document.getElementById('vaultUnlockedPanel');
const createMasterSection = document.getElementById('createMasterSection');
const unlockMasterSection = document.getElementById('unlockMasterSection');
const biometricUnlockContainer = document.getElementById('biometricUnlockContainer');
const vaultSearch = document.getElementById('vaultSearch');
const searchContainer = document.getElementById('searchContainer');
const entryForm = document.getElementById('entryForm');
const entrySiteInput = document.getElementById('entrySite');
const entryUsernameInput = document.getElementById('entryUsername');
const entryPasswordInput = document.getElementById('entryPassword');
const entryNotesInput = document.getElementById('entryNotes');
const entryModalTitle = document.getElementById('entryModalTitle');
const newMasterInput = document.getElementById('newMaster');
const confirmMasterInput = document.getElementById('confirmMaster');
const vaultPassphraseInput = document.getElementById('vaultPassphrase');
const currentMasterInput = document.getElementById('currentMaster');
const nextMasterInput = document.getElementById('nextMaster');
const confirmNextMasterInput = document.getElementById('confirmNextMaster');

let unlockSetupResolver = null;
let revealTimers = new Map();

function clearRevealTimer(id) {
  if (revealTimers.has(id)) {
    clearTimeout(revealTimers.get(id));
    revealTimers.delete(id);
  }
}

function createVaultIconButton(iconSvg, title, variant = 'secondary') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-button ${variant}`;
  btn.innerHTML = iconSvg;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  return btn;
}

export function renderEntries() {
  if (!vaultList || !vaultEmptyPanel) return;
  vaultList.innerHTML = '';
  const filtered = state.entries.filter(e => {
    if (!state.filter) return true;
    const term = state.filter.toLowerCase();
    return (
      (e.site || '').toLowerCase().includes(term) ||
      (e.username || '').toLowerCase().includes(term) ||
      (e.notes || '').toLowerCase().includes(term)
    );
  });

  if (filtered.length === 0) {
    vaultEmptyPanel.classList.remove('hidden');
    vaultList.classList.add('hidden');
    return;
  }

  vaultEmptyPanel.classList.add('hidden');
  vaultList.classList.remove('hidden');

  filtered.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'vault-item';

    const header = document.createElement('div');
    header.className = 'vault-item-header';
    const siteTitle = document.createElement('strong');
    siteTitle.textContent = entry.site;
    header.appendChild(siteTitle);

    if (entry.username) {
      const uname = document.createElement('span');
      uname.className = 'text-muted';
      uname.textContent = entry.username;
      header.appendChild(uname);
    }
    item.appendChild(header);

    const passRow = document.createElement('div');
    passRow.className = 'password-display';

    const passwordContainer = document.createElement('div');
    passwordContainer.className = 'password-value-container';

    const keyIcon = document.createElement('span');
    keyIcon.className = 'key-icon';
    keyIcon.innerHTML = ICONS.key;

    const passText = document.createElement('span');
    passText.className = 'password-value';
    passText.textContent = '••••••••••••';

    let isRevealed = false;
    const toggleBtn = createVaultIconButton(ICONS.eye, 'Show password');
    toggleBtn.classList.add('reveal-toggle');
    toggleBtn.addEventListener('click', () => {
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
        }, 10000);
        revealTimers.set(entry.id, timer);
      } else {
        passText.textContent = '••••••••••••';
        toggleBtn.innerHTML = ICONS.eye;
        toggleBtn.title = 'Show password';
        clearRevealTimer(entry.id);
      }
    });

    passwordContainer.appendChild(keyIcon);
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

    const copyBtn = createVaultIconButton(ICONS.copy, 'Copy password');
    copyBtn.addEventListener('click', async () => {
      resetInactivityTimer();
      const ok = await copyToClipboard(entry.password);
      showToast(ok ? 'Password copied to clipboard.' : 'Unable to copy password.', ok ? 'success' : 'warning');
    });

    const editBtn = createVaultIconButton(ICONS.edit, 'Edit credential');
    editBtn.addEventListener('click', () => {
      // Need to open entry modal for this entry
      import('../popup.js').then(p => p.openEntryModal(entry));
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

export function clearEntryForm() {
  if (entryForm) entryForm.reset();
  if (entrySiteInput) entrySiteInput.value = '';
  if (entryUsernameInput) entryUsernameInput.value = '';
  if (entryPasswordInput) entryPasswordInput.value = '';
  if (entryNotesInput) entryNotesInput.value = '';
}

export async function promptForMasterPassword(message = 'Enter your master password to continue.') {
  const unlockSetupLead = document.getElementById('unlockSetupLead');
  const unlockSetupForm = document.getElementById('unlockSetupForm');
  if (unlockSetupLead) unlockSetupLead.textContent = message;
  if (unlockSetupForm) unlockSetupForm.reset();
  openModal('unlockSetupModal');
  return new Promise(resolve => {
    unlockSetupResolver = resolve;
  });
}

export function resolveUnlockSetup(value) {
  if (unlockSetupResolver) {
    unlockSetupResolver(value);
    unlockSetupResolver = null;
  }
}

export function requireUnlockedVault() {
  if (state.vaultUnlocked) {
    resetInactivityTimer();
    return true;
  }
  showToast('Unlock the vault first to continue.', 'warning');
  setView('vault');
  return false;
}

export async function ensureVaultAccessible(promptLabel = 'Enter your master password to continue.') {
  const statusRes = await sendMessage('VAULT_STATUS');
  if (statusRes?.ok && statusRes.status?.unlocked) {
    state.vaultUnlocked = true;
    resetInactivityTimer();
    return true;
  }

  const typed = await promptForMasterPassword(promptLabel);
  const passphrase = (typed || '').trim();
  if (!passphrase) {
    showToast('Master password is required.', 'warning');
    return false;
  }

  const timeoutMinutes = state.settings?.vaultTimeout || 15;
  const response = await sendMessage('UNLOCK_VAULT', { passphrase, timeoutMinutes });
  if (!response?.ok) {
    showToast(response?.error || 'Unable to unlock vault.', 'error');
    return false;
  }

  state.passphrase = passphrase;
  state.vaultUnlocked = true;
  state.vaultInitialized = true;
  state.entries = response.data?.entries || [];
  renderVaultState();
  renderEntries();
  resetInactivityTimer();
  return true;
}

export async function lockVault(showMessage = false) {
  await sendMessage('LOCK_VAULT');
  state.vaultUnlocked = false;
  state.passphrase = null;
  state.entries = [];
  clearTimeout(state.inactivityTimer);
  renderVaultState();
  renderEntries();
  if (showMessage) {
    showToast('Vault locked.', 'info');
  }
}

export async function refreshVaultEntries() {
  if (!state.vaultUnlocked) return;
  const response = await sendMessage('LIST_CREDENTIALS');
  if (!response?.ok) return;
  if (!response.unlocked) {
    await lockVault();
    return;
  }
  state.entries = response.entries || [];
  renderEntries();
}

export async function deleteCredential(id) {
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

export async function handleEntrySubmit(event) {
  event.preventDefault();
  if (!requireUnlockedVault()) return;
  const site = sanitizeValue(entrySiteInput.value, 255, true);
  const username = sanitizeValue(entryUsernameInput.value, 255, true);
  const password = sanitizeValue(entryPasswordInput.value, 1024, false);
  const notes = sanitizeValue(entryNotesInput.value, 4096, true);

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

  const payload = { site, username, password, notes };
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

export async function handleUnlock(event) {
  event.preventDefault();
  const passphrase = sanitizeValue(vaultPassphraseInput.value, 1024, false);
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
  renderEntries();
  resetInactivityTimer();
  showToast('Vault unlocked.', 'success');
}

export async function handleCreateMaster(event) {
  event.preventDefault();
  const master = sanitizeValue(newMasterInput.value, 1024, false);
  const confirm = sanitizeValue(confirmMasterInput.value, 1024, false);
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
  renderEntries();
  resetInactivityTimer();
  showToast('Vault created and unlocked.', 'success');
}

export async function changeMasterPassword(event) {
  event.preventDefault();
  if (!requireUnlockedVault()) return;
  const current = sanitizeValue(currentMasterInput.value, 1024, false);
  const next = sanitizeValue(nextMasterInput.value, 1024, false);
  const confirm = sanitizeValue(confirmNextMasterInput.value, 1024, false);
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
