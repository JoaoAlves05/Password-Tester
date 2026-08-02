export const VAULT_KEY = 'securepassVault';
export const META_KEY = 'securepassMeta';
export const SECUREPASS_DB_NAME = 'SecurePassDB';
export const CHUNK_SIZE = 7000;
export const BIOMETRIC_SESSION_PASSPHRASE_KEY = 'biometricSessionPassphrase';
export const PRF_EVAL_LABEL = 'securepass-master-key-v1';
export const ALARM_NAME = 'vaultAutoLock';

// Alarm name for the clipboard auto-clear feature.
// Centralised here to avoid magic strings scattered across files.
export const CLIPBOARD_ALARM_NAME = 'clearClipboard';

// IndexedDB schema constants — kept here so storage.js and constants stay in sync.
export const DB_VERSION = 1;
export const DB_STORE_NAME = 'vault';

// Toggle logging from a single place. Set to false to silence logs by default in releases.
export const LOG_ENABLED = false;
