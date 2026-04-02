import { loadSettings } from './settings.js';

const SIMILAR_CHARS = /[Il1O0]/g;

function buildCharset(options, constraints) {
  const requirements = {
    requiresUppercase: false,
    requiresLowercase: false,
    requiresNumber: false,
    requiresSymbol: false,
    ...(constraints.customRequirements || {})
  };

  let charset = '';
  if (options.includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (options.includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (options.includeNumbers) charset += '0123456789';
  if (options.includeSymbols) charset += '!@#$%^&*()-_=+[]{}|;:,.<>?';

  if (constraints.pattern) {
    if (/\\d/.test(constraints.pattern) && !options.includeNumbers) {
      charset += '0123456789';
    }
    if (/\[A-Z\]/.test(constraints.pattern) && !options.includeUppercase) {
      charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    if (/\[a-z\]/.test(constraints.pattern) && !options.includeLowercase) {
      charset += 'abcdefghijklmnopqrstuvwxyz';
    }
  }

  if (requirements.requiresSymbol && !options.includeSymbols) {
    charset += '!@#$%^&*()-_=+[]{}|;:,.<>?';
  }

  charset = Array.from(new Set(charset.split(''))).join('');

  if (options.avoidSimilar) {
    charset = charset.replace(SIMILAR_CHARS, '');
  }

  if (!charset) {
    throw new Error('Select at least one character set for password generation.');
  }

  return charset;
}

function ensureRequirements(password, charset, constraints) {
  const requirements = {
    requiresUppercase: false,
    requiresLowercase: false,
    requiresNumber: false,
    requiresSymbol: false,
    ...(constraints.customRequirements || {})
  };
  const replacements = [];
  if (requirements.requiresUppercase && !/[A-Z]/.test(password)) {
    replacements.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  }
  if (requirements.requiresLowercase && !/[a-z]/.test(password)) {
    replacements.push('abcdefghijklmnopqrstuvwxyz');
  }
  if (requirements.requiresNumber && !/\d/.test(password)) {
    replacements.push('0123456789');
  }
  if (requirements.requiresSymbol && !/[^\w\s]/.test(password)) {
    replacements.push('!@#$%^&*()-_=+[]{}|;:,.<>?');
  }

  let result = password.split('');
  const random = crypto.getRandomValues(new Uint32Array(replacements.length));

  replacements.forEach((set, index) => {
    const pos = random[index] % result.length;
    const char = set[random[index] % set.length];
    result[pos] = char;
  });

  return result.join('');
}

export async function generatePassword(constraints = {}) {
  const settings = await loadSettings();
  const overrides = constraints.overrides || {};
  const options = {
    ...settings,
    ...overrides
  };

  const requestedLength = constraints.length || overrides.minLength || settings.minLength;
  const length = Math.max(4, Math.min(requestedLength, constraints.maxLength || 64));
  const charset = buildCharset(options, {
    customRequirements: constraints.customRequirements || {},
    pattern: constraints.pattern || null
  });

  const cryptoArray = new Uint32Array(length);
  let password = '';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    crypto.getRandomValues(cryptoArray);
    password = Array.from(cryptoArray, value => charset[value % charset.length]).join('');
    password = ensureRequirements(password, charset, {
      customRequirements: constraints.customRequirements || {}
    });

    if (constraints.pattern) {
      const regex = new RegExp(constraints.pattern);
      if (!regex.test(password)) {
        continue;
      }
    }

    if (constraints.confirmField) {
      constraints.confirmField.value = password;
      constraints.confirmField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return password;
  }

  return password;
}
