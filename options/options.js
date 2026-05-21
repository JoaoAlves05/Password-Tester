import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings.js';

const form = document.getElementById('settingsForm');
const statusEl = document.getElementById('status');

// Theme elements
const themeRadios = document.querySelectorAll('input[name="theme"]');

// Security sliders
const vaultTimeoutRange = document.getElementById('vaultTimeout');
const vaultTimeoutLabel = document.getElementById('vaultTimeoutLabel');
const clipboardTimeoutRange = document.getElementById('clipboardTimeout');
const clipboardTimeoutLabel = document.getElementById('clipboardTimeoutLabel');
const hibpCacheTtlRange = document.getElementById('hibpCacheTtlHours');
const hibpCacheTtlLabel = document.getElementById('hibpCacheTtlLabel');

// Generator sliders
const minLengthRange = document.getElementById('minLength');
const minLengthLabel = document.getElementById('minLengthLabel');

// Modal Elements
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalInputContainer = document.getElementById('modalInputContainer');
const modalInput = document.getElementById('modalInput');
const modalInputError = document.getElementById('modalInputError');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');
const modalClose = document.getElementById('modalClose');

// Vault Status Elements
const vaultStatusEl = document.getElementById('vaultStatus');
const vaultStatusText = vaultStatusEl?.querySelector('.status-text');

// State
let currentModalResolve = null;
let vaultStatusInterval = null;
let currentSettings = { ...DEFAULT_SETTINGS };

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
}

function updateSliderLabels() {
  if (vaultTimeoutRange && vaultTimeoutLabel) {
    vaultTimeoutLabel.textContent = `${vaultTimeoutRange.value} min`;
  }
  if (clipboardTimeoutRange && clipboardTimeoutLabel) {
    const val = Number(clipboardTimeoutRange.value);
    clipboardTimeoutLabel.textContent = val === 0 ? 'Never' : `${val}s`;
  }
  if (hibpCacheTtlRange && hibpCacheTtlLabel) {
    const hours = Number(hibpCacheTtlRange.value);
    hibpCacheTtlLabel.textContent = hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (minLengthRange && minLengthLabel) {
    minLengthLabel.textContent = minLengthRange.value;
  }
}

function populateForm(settings) {
  const formData = { ...DEFAULT_SETTINGS, ...settings };

  // Populate all form fields
  Object.entries(formData).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;

    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else if (field.type === 'radio') {
      const radio = form.querySelector(`input[name="${key}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else {
      field.value = value;
    }
  });

  updateSliderLabels();
  applyTheme(formData.theme);
}

// --- Modal Logic ---

function showModal({ title, message, showInput = false, inputType = 'password', confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    if (showInput) {
      modalInputContainer.classList.remove('hidden');
      modalInput.type = inputType;
      modalInput.value = '';
      modalInputError.classList.add('hidden');
      setTimeout(() => modalInput.focus(), 100);
    } else {
      modalInputContainer.classList.add('hidden');
    }

    modalConfirm.textContent = confirmText;
    modalCancel.textContent = cancelText;

    if (isDanger) {
      modalConfirm.style.background = 'var(--danger)';
      modalConfirm.style.color = 'white';
    } else {
      modalConfirm.style.background = ''; // Reset to default
      modalConfirm.style.color = '';
    }

    modalOverlay.classList.remove('hidden');
    currentModalResolve = resolve;
  });
}

function closeModal(result) {
  modalOverlay.classList.add('hidden');
  if (currentModalResolve) {
    currentModalResolve(result);
    currentModalResolve = null;
  }
}

function setupModalListeners() {
  modalCancel.addEventListener('click', () => closeModal({ confirmed: false }));
  modalClose.addEventListener('click', () => closeModal({ confirmed: false }));
  
  modalConfirm.addEventListener('click', () => {
    const value = modalInput.value;
    closeModal({ confirmed: true, value });
  });

  modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = modalInput.value;
      closeModal({ confirmed: true, value });
    }
    if (e.key === 'Escape') {
      closeModal({ confirmed: false });
    }
  });

  // Close on click outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal({ confirmed: false });
    }
  });
}

// --- Main Init ---

async function init() {
  const settings = await loadSettings();
  currentSettings = { ...settings };
  populateForm(settings);
  setupModalListeners();

  // Add slider event listeners
  if (vaultTimeoutRange) vaultTimeoutRange.addEventListener('input', updateSliderLabels);
  if (clipboardTimeoutRange) clipboardTimeoutRange.addEventListener('input', updateSliderLabels);
  if (hibpCacheTtlRange) hibpCacheTtlRange.addEventListener('input', updateSliderLabels);
  if (minLengthRange) minLengthRange.addEventListener('input', updateSliderLabels);

  // Add theme change listener
  themeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        applyTheme(radio.value);
      }
    });
  });

  // Start polling vault status
  checkVaultStatus();
  vaultStatusInterval = setInterval(checkVaultStatus, 2000);

  // Listen for storage changes to sync UI
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' || area === 'local') {
      // Check if any settings keys changed
      const settingsKeys = Object.keys(DEFAULT_SETTINGS);
      const hasSettingsChange = Object.keys(changes).some(key => settingsKeys.includes(key));
      
      if (hasSettingsChange) {
        loadSettings().then(settings => {
          currentSettings = { ...settings };
          populateForm(settings);
        });
      }
    }
  });
}

async function resolveSyncConflict(targetUseSync) {
  if (targetUseSync) {
    const choice = window.prompt(
      'Conflict detected: Local and Sync vaults are different.\n\n' +
      'Type 1 to keep Local (overwrite Sync).\n' +
      'Type 2 to use Sync (keep Sync as source).\n' +
      'Type 3 to cancel and merge manually via Export/Import.',
      '3'
    );

    const normalized = (choice || '').trim();
    if (normalized === '1') return 'keep-local';
    if (normalized === '2') return 'use-sync';
    return null;
  }

  const useSyncAsSource = window.confirm(
    'Both Local and Chrome Sync vaults exist and they are different.\n\n' +
    'Press OK to use Sync as source and overwrite Local.\n' +
    'Press Cancel to keep Local and disable Sync without overwriting Local.'
  );
  return useSyncAsSource ? 'use-sync' : 'keep-local';
}

async function applySyncModeSafely(targetUseSync) {
  let response = await sendMessage('SET_SYNC_MODE_SAFE', { targetUseSync });
  if (!response?.ok) {
    throw new Error(response?.error || 'Unable to change sync mode.');
  }

  if (response.requiresResolution) {
    const strategy = await resolveSyncConflict(targetUseSync);
    if (!strategy) {
      throw new Error('Sync switch cancelled. You can merge manually via Export/Import first.');
    }
    response = await sendMessage('SET_SYNC_MODE_SAFE', { targetUseSync, strategy });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to resolve sync conflict.');
    }
  }

  return response;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form);
  const settings = {};

  data.forEach((value, key) => {
    const field = form.elements.namedItem(key);
    if (field.type === 'checkbox') {
      settings[key] = field.checked;
    } else if (field.type === 'number' || field.type === 'range') {
      settings[key] = Number(value);
    } else {
      settings[key] = value;
    }
  });

  // Handle unchecked checkboxes
  Array.from(form.elements).forEach(element => {
    if (element.type === 'checkbox' && !settings.hasOwnProperty(element.name)) {
      settings[element.name] = false;
    }
  });

  try {
    const previousUseSync = Boolean(currentSettings.useSync);
    const targetUseSync = Boolean(settings.useSync);

    if (targetUseSync !== previousUseSync) {
      const syncResult = await applySyncModeSafely(targetUseSync);
      if (!syncResult?.ok) {
        throw new Error(syncResult?.error || 'Unable to apply sync mode safely.');
      }
      settings.useSync = targetUseSync;
    }

    await saveSettings(settings);
    currentSettings = { ...settings };
    applyTheme(settings.theme);
    showStatus('Settings saved successfully!');
  } catch (error) {
    const reloaded = await loadSettings();
    currentSettings = { ...reloaded };
    populateForm(reloaded);
    showStatus(error.message || 'Unable to save settings.', 'error');
  }
});

function showStatus(msg, type = 'success') {
  statusEl.textContent = msg;
  statusEl.style.color = type === 'error' ? 'var(--danger)' : 'var(--success)';
  statusEl.classList.add('visible');

  setTimeout(() => {
    statusEl.classList.remove('visible');
    setTimeout(() => {
      statusEl.textContent = '';
    }, 300);
  }, 3000);
}

// Listen for system theme changes if 'system' is selected
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const systemRadio = form.querySelector('input[name="theme"][value="system"]');
  if (systemRadio && systemRadio.checked) {
    applyTheme('system');
  }
});

// --- Data Management ---

const resetSettingsBtn = document.getElementById('resetSettings');
const clearDataBtn = document.getElementById('clearData');
const exportVaultBtn = document.getElementById('exportVault');
const importVaultBtn = document.getElementById('importVaultBtn');
const importVaultFile = document.getElementById('importVaultFile');

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

// --- Vault Status Sync ---

async function checkVaultStatus() {
  const response = await sendMessage('VAULT_STATUS');
  if (response.ok && vaultStatusEl && vaultStatusText) {
    const isUnlocked = response.status.unlocked;
    vaultStatusEl.classList.remove('hidden');
    if (isUnlocked) {
      vaultStatusEl.classList.add('unlocked');
      vaultStatusEl.classList.remove('locked');
      vaultStatusText.textContent = 'Vault Unlocked';
    } else {
      vaultStatusEl.classList.add('locked');
      vaultStatusEl.classList.remove('unlocked');
      vaultStatusText.textContent = 'Vault Locked';
    }
  }
}

async function handleResetSettings() {
  const { confirmed } = await showModal({
    title: 'Reset Settings',
    message: 'Are you sure you want to reset all settings to default? This cannot be undone.',
    confirmText: 'Reset',
    isDanger: true
  });

  if (!confirmed) return;

  try {
    const previousUseSync = Boolean(currentSettings.useSync);
    const targetUseSync = Boolean(DEFAULT_SETTINGS.useSync);
    if (targetUseSync !== previousUseSync) {
      await applySyncModeSafely(targetUseSync);
    }

    await saveSettings(DEFAULT_SETTINGS);
    currentSettings = { ...DEFAULT_SETTINGS };
    populateForm(DEFAULT_SETTINGS);
    showStatus('Settings reset to defaults.');
  } catch (error) {
    showStatus(error.message || 'Unable to reset settings.', 'error');
  }
}

async function handleClearData() {
  const { confirmed } = await showModal({
    title: 'Clear All Data',
    message: 'DANGER: This will permanently delete ALL vault data, settings, biometric setup, and local storage. Type WIPE ALL DATA to continue.',
    confirmText: 'Delete Everything',
    isDanger: true
  });

  if (!confirmed) return;

  const { confirmed: phraseConfirmed, value: phrase } = await showModal({
    title: 'Confirm Deletion',
    message: 'Type WIPE ALL DATA exactly as shown to permanently delete everything stored by SecurePass.',
    showInput: true,
    inputType: 'text',
    confirmText: 'Wipe Everything',
    isDanger: true
  });

  if (!phraseConfirmed || (phrase || '').trim() !== 'WIPE ALL DATA') {
    showStatus('Deletion cancelled.', 'warning');
    return;
  }

  const response = await sendMessage('WIPE_ALL_DATA');
  if (!response?.ok) {
    showStatus(response?.error || 'Unable to clear data.', 'error');
    return;
  }

  populateForm(DEFAULT_SETTINGS);
  showStatus('All data cleared successfully.');
  
  // Update status immediately
  checkVaultStatus();
}

async function ensureVaultUnlocked() {
  const statusRes = await sendMessage('VAULT_STATUS');
  if (statusRes.ok && statusRes.status.unlocked) {
    return true;
  }

  // Vault is locked, ask for password
  const { confirmed, value: password } = await showModal({
    title: 'Unlock Vault',
    message: 'Your vault is locked. Please enter your master password to proceed.',
    showInput: true,
    confirmText: 'Unlock'
  });

  if (!confirmed || !password) return false;

  const unlockRes = await sendMessage('UNLOCK_VAULT', { passphrase: password });
  if (!unlockRes.ok) {
    showStatus('Incorrect password.', 'error');
    return false;
  }

  // Update status immediately
  checkVaultStatus();
  return true;
}

async function handleExportVault() {
  if (!(await ensureVaultUnlocked())) return;

  const { confirmed, value: backupPassword } = await showModal({
    title: 'Encrypt Backup',
    message: 'Set a backup password. You will need this password to import the backup later.',
    showInput: true,
    inputType: 'password',
    confirmText: 'Export Encrypted'
  });

  if (!confirmed || !(backupPassword || '').trim()) {
    showStatus('Backup export cancelled.', 'warning');
    return;
  }

  const response = await sendMessage('EXPORT_VAULT', {
    format: 'encrypted',
    backupPassword: backupPassword.trim()
  });
  if (!response?.ok) {
    showStatus(response?.error || 'Export failed.', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `securepass-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showStatus('Vault exported successfully.');
}

function handleImportVault() {
  importVaultFile.click();
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!(await ensureVaultUnlocked())) {
        importVaultFile.value = '';
        return;
      }

      let backupPassword = '';
      if (data?.kind === 'securepass-encrypted-backup') {
        const prompt = await showModal({
          title: 'Encrypted Backup',
          message: 'Enter the backup password used when this file was exported.',
          showInput: true,
          inputType: 'password',
          confirmText: 'Import Backup'
        });

        if (!prompt.confirmed || !(prompt.value || '').trim()) {
          importVaultFile.value = '';
          showStatus('Import cancelled.', 'warning');
          return;
        }

        backupPassword = prompt.value.trim();
      }

      const response = await sendMessage('IMPORT_VAULT', { data, backupPassword });

      if (!response?.ok) {
        showStatus(response?.error || 'Import failed.', 'error');
        return;
      }

      showStatus(`Successfully imported ${response.count} credentials.`);
      importVaultFile.value = ''; // Reset file input
      
      // Update status immediately
      checkVaultStatus();
    } catch (err) {
      showStatus('Invalid JSON file.', 'error');
    }
  };
  reader.readAsText(file);
}

if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', handleResetSettings);
if (clearDataBtn) clearDataBtn.addEventListener('click', handleClearData);
if (exportVaultBtn) exportVaultBtn.addEventListener('click', handleExportVault);
if (importVaultBtn) importVaultBtn.addEventListener('click', handleImportVault);
if (importVaultFile) importVaultFile.addEventListener('change', handleImportFile);

document.addEventListener('DOMContentLoaded', init);
