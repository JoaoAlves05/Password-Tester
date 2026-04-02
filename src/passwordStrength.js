const COMMON_PATTERNS = [
  /password/i,
  /12345/,
  /qwerty/i,
  /letmein/i,
  /welcome/i,
  /(.)\1{2,}/
];

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:\'\",.<>/?`~',
  spaces: ' '
};

function estimateCharsetSize(password) {
  let size = 0;
  const checks = {
    lower: /[a-z]/,
    upper: /[A-Z]/,
    digits: /\d/,
    symbols: /[^\w\s]/,
    spaces: /\s/
  };
  Object.entries(checks).forEach(([key, regex]) => {
    if (regex.test(password)) {
      size += CHARSETS[key].length;
    }
  });
  return size || CHARSETS.lower.length;
}

function calculateEntropy(password) {
  if (!password) return 0;
  const charset = estimateCharsetSize(password);
  return Math.round(password.length * Math.log2(charset));
}

function detectSequential(password) {
  const sequences = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789'];
  return sequences.some(seq => seq.includes(password.toLowerCase())) || /(0123|1234|2345|3456|4567|5678|6789)/.test(password);
}

function getSuggestions(password) {
  const suggestions = [];
  if (password.length < 12) suggestions.push('Use at least 12 characters.');
  if (!/[A-Z]/.test(password)) suggestions.push('Add uppercase letters.');
  if (!/[a-z]/.test(password)) suggestions.push('Add lowercase letters.');
  if (!/\d/.test(password)) suggestions.push('Include numbers.');
  if (!/[^\w\s]/.test(password)) suggestions.push('Add special characters.');
  if (/\s/.test(password)) suggestions.push('Avoid spaces.');
  if (detectSequential(password)) suggestions.push('Avoid sequential patterns.');
  if (COMMON_PATTERNS.some(pattern => pattern.test(password))) suggestions.push('Avoid common patterns.');
  return suggestions;
}

function crackTime(entropy) {
  const guessesPerSecond = 1e10;
  const guesses = Math.pow(2, entropy);
  const seconds = guesses / guessesPerSecond;
  if (seconds < 1e2) return 'seconds';
  if (seconds < 1e4) return 'minutes';
  if (seconds < 1e6) return 'hours';
  if (seconds < 1e8) return 'days';
  if (seconds < 1e10) return 'months';
  if (seconds < 1e12) return 'years';
  return 'centuries';
}

export function evaluatePassword(password) {
  const entropy = calculateEntropy(password);
  const lengthScore = Math.min(password.length / 12, 1);
  const diversityScore = Math.min(estimateCharsetSize(password) / 94, 1);
  const patternPenalty = COMMON_PATTERNS.some(pattern => pattern.test(password)) || detectSequential(password) ? 0.4 : 1;
  const entropyScore = Math.min(entropy / 120, 1);
  const score = Math.max(0, Math.min(1, (lengthScore * 0.35 + diversityScore * 0.25 + entropyScore * 0.35) * patternPenalty));

  let verdict = 'Weak';
  if (score >= 0.8) verdict = 'Excellent';
  else if (score >= 0.6) verdict = 'Strong';
  else if (score >= 0.4) verdict = 'Fair';

  return {
    score,
    verdict,
    entropy,
    suggestions: getSuggestions(password),
    crackTime: crackTime(entropy)
  };
}
