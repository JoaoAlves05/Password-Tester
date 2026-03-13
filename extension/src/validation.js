/**
 * Validation and sanitization utilities for SecurePass Backend
 */

export const MAX_LENGTHS = {
  site: 255,
  username: 255,
  password: 1024,
  notes: 4096,
  id: 64
};

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  // Remove control characters (except common whitespace), keep printable characters
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

export function validateString(value, maxLength, fieldName, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required`);
    return '';
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const sanitized = sanitizeString(value);

  if (required && sanitized.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  if (sanitized.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }

  return sanitized;
}

export function validateEntry(entry, isUpdate = false) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Invalid entry format');
  }

  // ID is optional on create, required on update (usually handled separately, but validated here if present)
  let id = entry.id;
  if (id !== undefined) {
    id = validateString(id, MAX_LENGTHS.id, 'id', isUpdate);
  }

  const site = validateString(entry.site, MAX_LENGTHS.site, 'site', !isUpdate); // For updates, it might be partial, but our app sends full objects usually. Let's assume full object.
  const username = validateString(entry.username, MAX_LENGTHS.username, 'username', false);
  const password = validateString(entry.password, MAX_LENGTHS.password, 'password', !isUpdate); // Password usually required unless partial update
  const notes = validateString(entry.notes, MAX_LENGTHS.notes, 'notes', false);

  const cleanEntry = {};
  if (id) cleanEntry.id = id;
  if (entry.site !== undefined) cleanEntry.site = site;
  if (entry.username !== undefined) cleanEntry.username = username;
  if (entry.password !== undefined) cleanEntry.password = password;
  if (entry.notes !== undefined) cleanEntry.notes = notes;
  if (entry.createdAt) cleanEntry.createdAt = validateString(entry.createdAt, 64, 'createdAt', false);

  return cleanEntry;
}

export function validateConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return {};

  const cleanConstraints = {};
  
  if (constraints.length !== undefined) {
    if (typeof constraints.length !== 'number' || constraints.length < 1 || constraints.length > 128) {
      throw new Error('Password length must be a number between 1 and 128');
    }
    cleanConstraints.length = constraints.length;
  }

  const booleanFields = ['lowercase', 'uppercase', 'numbers', 'symbols', 'avoidSimilar'];
  for (const field of booleanFields) {
    if (constraints[field] !== undefined) {
      cleanConstraints[field] = Boolean(constraints[field]);
    }
  }

  return cleanConstraints;
}

export function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid import data format: must be an object');
  }

  let entries = data.entries;
  if (!entries && Array.isArray(data)) {
    entries = data;
  }

  if (!Array.isArray(entries)) {
    throw new Error('Invalid import data format: missing entries array');
  }

  // Validate each entry and filter out completely mangled ones, or fail the whole import?
  // Failing the whole import is safer. Let's validate all.
  const cleanEntries = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      const clean = validateEntry(entries[i]);
      // Must have password
      if (!clean.password) {
        throw new Error('Password is required');
      }
      cleanEntries.push(clean);
    } catch (err) {
      throw new Error(`Invalid entry at index ${i}: ${err.message}`);
    }
  }

  return { entries: cleanEntries };
}
