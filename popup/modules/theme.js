/**
 * theme.js — Theme resolution and application for SecurePass UI pages.
 *
 * Previously duplicated in popup.js and options.js — now a shared module.
 */

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Resolves 'system' to the actual OS preference; returns 'dark' or 'light'.
 * @param {'system'|'dark'|'light'} theme
 * @returns {'dark'|'light'}
 */
export function resolveTheme(theme) {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

/**
 * Applies a theme by setting data-theme on <body>.
 * @param {'system'|'dark'|'light'} theme
 */
export function applyTheme(theme) {
  document.body.dataset.theme = resolveTheme(theme);
}

/**
 * Registers a listener that re-applies the current theme whenever the OS
 * colour scheme changes (only relevant when theme === 'system').
 *
 * @param {() => string} getTheme - Callback that returns the current theme string.
 * @returns {() => void} Cleanup function that removes the listener.
 */
export function watchSystemTheme(getTheme) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => applyTheme(getTheme());
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
