import { LOG_ENABLED as DEFAULT_LOG_ENABLED } from './constants.js';

const SENSITIVE_KEY_PATTERNS = [
  'pass', 'password', 'secret', 'key', 'private', 'master', 'token', 'salt', 'iv', 'credential'
];

function isPrimitive(v) {
  return v === null || (typeof v !== 'object' && typeof v !== 'function');
}

function isArrayBufferLike(v) {
  return v instanceof ArrayBuffer || ArrayBuffer.isView(v);
}

function redactValue(key, value) {
  try {
    if (!key) return value;
    const lk = String(key).toLowerCase();
    for (const p of SENSITIVE_KEY_PATTERNS) {
      if (lk.includes(p)) return '[REDACTED]';
    }
    return value;
  } catch {
    return '[REDACTED]';
  }
}

function safeSerialize(obj) {
  const seen = new WeakSet();

  function _serialize(value, key) {
    if (isPrimitive(value)) {
      if (typeof value === 'string') {
        const s = value.trim();
        // redact obviously sensitive strings
        if (isSensitiveString(s)) return '[REDACTED]';
        return s;
      }
      return String(value);
    }
    if (isArrayBufferLike(value)) {
      try {
        const len = value.byteLength ?? value.length ?? 0;
        return `[ArrayBuffer ${len} bytes]`;
      } catch {
        return '[ArrayBuffer]';
      }
    }
    if (typeof value === 'function') return '[Function]';
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return '[' + value.map((v, i) => _serialize(v, i)).join(', ') + ']';
    try {
      const parts = [];
      for (const k of Object.keys(value)) {
        const redacted = redactValue(k, value[k]);
        parts.push(`${k}: ${_serialize(redacted, k)}`);
      }
      return `{ ${parts.join(', ')} }`;
    } catch {
      return String(value);
    }
  }

  return _serialize(obj);
}

// In-memory ring buffer for recent logs (kept only in runtime memory).
const MAX_LOG_ENTRIES = 500;
const buffer = [];
let enabled = !!DEFAULT_LOG_ENABLED;

function pushToBuffer(level, message) {
  try {
    buffer.push({ ts: new Date().toISOString(), level, message });
    if (buffer.length > MAX_LOG_ENTRIES) buffer.shift();
  } catch {}
}

function isSensitiveString(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  // base64-like
  if (t.length >= 40 && /^[A-Za-z0-9+/=]+$/.test(t)) return true;
  // hex-like
  if (t.length >= 40 && /^[A-Fa-f0-9]+$/.test(t)) return true;
  // jwt-like
  if (t.split('.').length === 3 && t.length > 30) return true;
  const lower = t.toLowerCase();
  for (const p of SENSITIVE_KEY_PATTERNS) {
    if (lower.includes(p)) return true;
  }
  // alphanumeric long token without spaces
  if (t.length >= 20 && /\d/.test(t) && /[A-Za-z]/.test(t) && !/\s/.test(t)) return true;
  return false;
}

function format(...args) {
  try {
    return args.map(a => safeSerialize(a)).join(' ');
  } catch {
    return args.map(a => String(a)).join(' ');
  }
}

export const logger = {
  // Internal safe console wrapper to avoid unexpected exceptions in restricted contexts
  error: (...args) => {
    if (!enabled) return;
    const msg = format(...args);
    try {
      if (typeof console !== 'undefined' && console.error) console.error('[SecurePass]', msg);
    } catch {}
    pushToBuffer('error', msg);
  },
  warn: (...args) => {
    if (!enabled) return;
    const msg = format(...args);
    try {
      if (typeof console !== 'undefined' && console.warn) console.warn('[SecurePass]', msg);
    } catch {}
    pushToBuffer('warn', msg);
  },
  info: (...args) => {
    if (!enabled) return;
    const msg = format(...args);
    try {
      if (typeof console !== 'undefined' && console.info) console.info('[SecurePass]', msg);
    } catch {}
    pushToBuffer('info', msg);
  },
  debug: (...args) => {
    if (!enabled) return;
    const msg = format(...args);
    try {
      if (typeof console !== 'undefined') {
        if (console.debug) console.debug('[SecurePass]', msg);
        else if (console.log) console.log('[SecurePass]', msg);
      }
    } catch {}
    pushToBuffer('debug', msg);
  },
  // Runtime controls
  setEnabled: (v) => { enabled = !!v; },
  getEnabled: () => !!enabled,
  // Log buffer access (read-only copy)
  getBuffer: () => buffer.slice(),
  clearBuffer: () => { buffer.length = 0; },
};
