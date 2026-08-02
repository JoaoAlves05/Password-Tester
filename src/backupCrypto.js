import { bufferToBase64, base64ToBuffer } from './encoding.js';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const BACKUP_ENCRYPTED_KIND = 'securepass-encrypted-backup';
const BACKUP_ENCRYPTED_VERSION = 1;
const BACKUP_PBKDF2_ITERATIONS = 450000;



async function deriveBackupKey(password, saltBuffer, iterations = BACKUP_PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptedBackupEnvelope(data) {
  return Boolean(data && typeof data === 'object' && data.kind === BACKUP_ENCRYPTED_KIND);
}

export async function encryptBackupPayload(payload, backupPassword) {
  if (!backupPassword || typeof backupPassword !== 'string') {
    throw new Error('Backup password is required.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(backupPassword, salt.buffer);
  const encoded = ENCODER.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    kind: BACKUP_ENCRYPTED_KIND,
    version: BACKUP_ENCRYPTED_VERSION,
    createdAt: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: BACKUP_PBKDF2_ITERATIONS,
      salt: bufferToBase64(salt.buffer)
    },
    cipher: {
      name: 'AES-GCM',
      iv: bufferToBase64(iv.buffer),
      ciphertext: bufferToBase64(ciphertext)
    }
  };
}

export async function decryptBackupPayload(encryptedBackup, backupPassword) {
  if (!isEncryptedBackupEnvelope(encryptedBackup)) {
    throw new Error('Invalid encrypted backup format.');
  }

  if (!backupPassword || typeof backupPassword !== 'string') {
    throw new Error('Backup password is required for encrypted backups.');
  }

  const kdf = encryptedBackup.kdf || {};
  const cipher = encryptedBackup.cipher || {};

  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') {
    throw new Error('Unsupported backup KDF configuration.');
  }
  if (cipher.name !== 'AES-GCM') {
    throw new Error('Unsupported backup cipher configuration.');
  }

  const iterations = Number(kdf.iterations);
  if (!Number.isFinite(iterations) || iterations < 100000) {
    throw new Error('Invalid backup KDF iterations.');
  }

  const saltBuffer = base64ToBuffer(kdf.salt || '');
  const ivBuffer = base64ToBuffer(cipher.iv || '');
  const ciphertextBuffer = base64ToBuffer(cipher.ciphertext || '');

  const key = await deriveBackupKey(backupPassword, saltBuffer, iterations);

  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
      key,
      ciphertextBuffer
    );
  } catch {
    throw new Error('Invalid backup password or corrupted backup file.');
  }

  let parsed;
  try {
    parsed = JSON.parse(DECODER.decode(decrypted));
  } catch {
    throw new Error('Decrypted backup payload is invalid.');
  }

  return parsed;
}
