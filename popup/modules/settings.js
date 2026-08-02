import { sendMessage } from './messaging.js';
import { showToast } from './toast.js';
import { applyTheme } from './theme.js';
import { state, resetInactivityTimer, openMasterModal } from '../popup.js';

const themeRadios = document.querySelectorAll('input[name="appearanceTheme"]');
const autoLockRange = document.getElementById('autoLockRange');
const autoLockLabel = document.getElementById('autoLockLabel');
const syncToggle = document.getElementById('syncToggle');
const trustedDeviceToggle = document.getElementById('trustedDeviceToggle');
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
const resetSettingsBtn = document.getElementById('resetSettings');
const changeMasterKeyBtn = document.getElementById('changeMasterKeyBtn');
const settingsPanel = document.getElementById('settingsPanel');

let settingsSaveTimeout = null;

export function scheduleSettingsSave() {
  if (!state.settings) return;
  clearTimeout(settingsSaveTimeout);
  settingsSaveTimeout = setTimeout(() => {
    sendMessage('SAVE_SETTINGS', { settings: state.settings }).catch(() => {
      showToast('Unable to save preferences.', 'warning');
    });
  }, 250);
}

export function syncSettingsView() {
  if (!state.settings) return;
  themeRadios.forEach(radio => {
    radio.checked = radio.value === state.settings.theme;
  });
  const timeout = state.settings.vaultTimeout || 15;
  if (autoLockRange) autoLockRange.value = timeout;
  if (autoLockLabel) autoLockLabel.textContent = `${timeout} min`;
  
  if (syncToggle) syncToggle.checked = Boolean(state.settings.useSync);
  if (trustedDeviceToggle) {
    trustedDeviceToggle.checked = Boolean(state.settings.trustedDeviceMode);
    const warning = document.getElementById('trustedDeviceWarning');
    if (warning) warning.classList.toggle('hidden', !trustedDeviceToggle.checked);
  }

  const clipboardTimeout = state.settings.clipboardTimeout ?? 30;
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

export async function applySyncModeSafely(targetUseSync) {
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

export function attachSettingsListeners() {
  themeRadios.forEach(radio => {
    radio.addEventListener('change', event => {
      if (!event.target.checked || !state.settings) return;
      state.settings.theme = event.target.value;
      applyTheme(event.target.value);
      scheduleSettingsSave();
      syncSettingsView();
    });
  });

  if (autoLockRange) {
    autoLockRange.addEventListener('input', event => {
      if (autoLockLabel) autoLockLabel.textContent = `${event.target.value} min`;
    });
    autoLockRange.addEventListener('change', () => {
      if (!state.settings) return;
      state.settings.vaultTimeout = Number(autoLockRange.value);
      scheduleSettingsSave();
      resetInactivityTimer();
    });
  }

  if (syncToggle) {
    syncToggle.addEventListener('change', async () => {
      if (!state.settings) return;
      const previous = Boolean(state.settings.useSync);
      const targetUseSync = Boolean(syncToggle.checked);
      if (targetUseSync === previous) return;

      syncToggle.disabled = true;
      try {
        const res = await applySyncModeSafely(targetUseSync);
        if (!res?.settings) throw new Error('Sync mode changed, but updated settings were not returned.');
        
        state.settings = { ...state.settings, ...res.settings };
        syncToggle.checked = Boolean(state.settings.useSync);
        showToast(state.settings.useSync ? 'Chrome Sync enabled safely.' : 'Local storage enabled safely.', 'success');
      } catch (error) {
        syncToggle.checked = previous;
        state.settings.useSync = previous;
        showToast(error.message || 'Unable to change sync mode.', 'error');
      } finally {
        syncToggle.disabled = false;
      }
    });
  }

  if (trustedDeviceToggle) {
    trustedDeviceToggle.addEventListener('change', () => {
      if (!state.settings) return;
      state.settings.trustedDeviceMode = Boolean(trustedDeviceToggle.checked);
      scheduleSettingsSave();
      const warning = document.getElementById('trustedDeviceWarning');
      if (warning) warning.classList.toggle('hidden', !trustedDeviceToggle.checked);
    });
  }

  if (clipboardRange) {
    clipboardRange.addEventListener('input', () => {
      const val = Number(clipboardRange.value);
      if (clipboardLabel) clipboardLabel.textContent = val === 0 ? 'Never' : `${val}s`;
      state.settings.clipboardTimeout = val;
      scheduleSettingsSave();
    });
  }

  if (hibpCacheRange) {
    hibpCacheRange.addEventListener('input', () => {
      const val = Number(hibpCacheRange.value);
      if (hibpCacheLabel) hibpCacheLabel.textContent = val === 1 ? '1 hour' : `${val} hours`;
      state.settings.hibpCacheTtlHours = val;
      scheduleSettingsSave();
    });
  }

  if (defaultLengthRange) {
    defaultLengthRange.addEventListener('input', () => {
      const val = Number(defaultLengthRange.value);
      if (defaultLengthLabel) defaultLengthLabel.textContent = val;
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

  if (changeMasterKeyBtn) {
    changeMasterKeyBtn.addEventListener('click', () => {
      openMasterModal();
    });
  }

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) return;
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
        trustedDeviceMode: false,
        useSync: false,
        clipboardTimeout: 30,
        generatorDefaults: { length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true }
      };

      try {
        const previous = Boolean(state.settings?.useSync);
        const targetUseSync = Boolean(defaults.useSync);
        if (targetUseSync !== previous) {
          await applySyncModeSafely(targetUseSync);
        }
        state.settings = defaults;
        await sendMessage('SAVE_SETTINGS', { settings: state.settings });
        applyTheme(state.settings.theme);
        syncSettingsView();
        showToast('Settings reset to defaults.', 'success');
      } catch (error) {
        showToast(error.message || 'Unable to reset settings safely.', 'error');
      }
    });
  }
}
