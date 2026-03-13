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

function showModal({ title, message, showInput = false, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    if (showInput) {
      modalInputContainer.classList.remove('hidden');
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
          populateForm(settings);
        });
      }
    }
  });
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

  await saveSettings(settings);
  applyTheme(settings.theme);

  showStatus('Settings saved successfully!');
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

  await saveSettings(DEFAULT_SETTINGS);
  populateForm(DEFAULT_SETTINGS);
  showStatus('Settings reset to defaults.');
}

async function handleClearData() {
  const { confirmed } = await showModal({
    title: 'Clear All Data',
    message: 'DANGER: This will permanently delete ALL your vault data and reset all settings. This action is irreversible.',
    confirmText: 'Delete Everything',
    isDanger: true
  });

  if (!confirmed) return;

  // Double confirmation with password
  const { confirmed: passConfirmed, value: password } = await showModal({
    title: 'Confirm Deletion',
    message: 'Please enter your master password to confirm deletion.',
    showInput: true,
    confirmText: 'Confirm Deletion',
    isDanger: true
  });

  if (!passConfirmed || !password) return;

  // VERIFY PASSWORD by attempting to unlock
  // If the vault is already unlocked, we still want to verify the user knows the password (re-auth)
  // But UNLOCK_VAULT works even if already unlocked (it just returns success)
  // However, we should make sure the password is correct.
  // If the password is wrong, UNLOCK_VAULT returns error.
  
  const unlockRes = await sendMessage('UNLOCK_VAULT', { passphrase: password });
  if (!unlockRes.ok) {
    showStatus('Incorrect password. Data NOT cleared.', 'error');
    return;
  }

  // Password verified, proceed with deletion
  
  // Clear local storage (vault + settings)
  await chrome.storage.local.clear();
  // Clear sync storage (synced settings)
  await chrome.storage.sync.clear();

  // Reload defaults
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

  const response = await sendMessage('EXPORT_VAULT');
  if (!response?.ok) {
    showStatus(response?.error || 'Export failed.', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `securepass-vault-${new Date().toISOString().slice(0, 10)}.json`;
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
      
      // We need the password to re-encrypt the data into the vault
      const { confirmed, value: password } = await showModal({
        title: 'Import Vault',
        message: 'Enter your master password to encrypt and import the data.',
        showInput: true,
        confirmText: 'Import'
      });

      if (!confirmed || !password) {
        importVaultFile.value = '';
        return;
      }

      // Ensure unlocked first (needed for some internal checks in SW)
      const unlockRes = await sendMessage('UNLOCK_VAULT', { passphrase: password });
      if (!unlockRes.ok) {
        showStatus('Incorrect password. Import cancelled.', 'error');
        importVaultFile.value = '';
        return;
      }

      const response = await sendMessage('IMPORT_VAULT', { data, passphrase: password });

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
