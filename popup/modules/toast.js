/**
 * toast.js — Non-blocking notification toasts for the SecurePass popup.
 */

const TOAST_DURATION_MS = 3200;

let toastEl = null;
let activeTimer = null;

/**
 * Must be called once after the DOM is ready.
 * @param {HTMLElement} element - The toast container element.
 */
export function initToast(element) {
  toastEl = element;
}

/**
 * Shows a toast notification.
 *
 * @param {string} message       - The text to display.
 * @param {'info'|'success'|'error'|'warning'} variant
 */
export function showToast(message, variant = 'info') {
  if (!toastEl) return;

  // Cancel any running dismiss timer so rapid consecutive toasts work correctly.
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }

  toastEl.textContent = message;
  toastEl.classList.remove('visible', 'success', 'error', 'warning');
  if (variant !== 'info') toastEl.classList.add(variant);

  requestAnimationFrame(() => {
    toastEl.classList.add('visible');
  });

  activeTimer = setTimeout(() => {
    toastEl.classList.remove('visible', 'success', 'error', 'warning');
    activeTimer = null;
  }, TOAST_DURATION_MS);
}
