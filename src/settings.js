import { getStorage, setStorage } from './storage.js';

export const DEFAULT_SETTINGS = {
  theme: 'system',
  minLength: 16,
  includeUppercase: true,
  includeLowercase: true,
  includeNumbers: true,
  includeSymbols: true,
  avoidSimilar: true,
  vaultTimeout: 15,
  clipboardTimeout: 30,
  hibpCacheTtlHours: 24,
  useSync: false
};

export async function loadSettings() {
  const area = (await getStorage('local', ['settingsSync']))?.settingsSync?.useSync ? 'sync' : 'local';
  const stored = await getStorage(area, ['settings']);
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function saveSettings(settings) {
  const area = settings.useSync ? 'sync' : 'local';
  await setStorage(area, { settings });
  await setStorage('local', { settingsSync: { useSync: settings.useSync } });
}
