import { evaluatePassword } from '../../src/passwordStrength.js';
import { sendMessage } from './messaging.js';
import { showToast } from './toast.js';
import { detectActiveOrigin, openEntryModal } from '../popup.js';

const passwordInput = document.getElementById('passwordInput');
const strengthBar = document.getElementById('strengthBar');
const strengthVerdict = document.getElementById('strengthVerdict');
const entropyEl = document.getElementById('entropy');
const crackTimeEl = document.getElementById('crackTime');
const suggestionsList = document.getElementById('suggestionsList');
const suggestionsEmpty = document.getElementById('suggestionsEmpty');
const hibpStatus = document.getElementById('hibpStatus');
const hibpButton = document.getElementById('checkHibp');
const copyTestPasswordBtn = document.getElementById('copyTestPassword');
const saveTestedBtn = document.getElementById('saveTested');

function mapScoreToColor(score) {
  if (score >= 0.8) return 'linear-gradient(90deg, #22c55e, #16a34a)';
  if (score >= 0.6) return 'linear-gradient(90deg, #84cc16, #16a34a)';
  if (score >= 0.4) return 'linear-gradient(90deg, #f97316, #f59e0b)';
  return 'linear-gradient(90deg, #ef4444, #dc2626)';
}

function scoreToBadge(score) {
  if (score >= 0.75) return 'badge-strong';
  if (score >= 0.45) return 'badge-medium';
  return 'badge-weak';
}

function toggleCollapsible(button) {
  if (!button) return;
  const targetId = button.getAttribute('data-toggle-target');
  if (!targetId) return;
  const target = document.getElementById(targetId);
  if (!target) return;
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  const nextState = !isExpanded;
  button.setAttribute('aria-expanded', String(nextState));
  target.hidden = !nextState;
  // Update label handled in caller if needed
}

export function updateStrength(password) {
  const { score, verdict, entropy, crackTime, suggestions } = evaluatePassword(password);
  if (strengthBar) {
    strengthBar.style.width = `${Math.max(score * 100, 6)}%`;
    strengthBar.style.background = mapScoreToColor(score);
  }
  if (strengthVerdict) {
    strengthVerdict.textContent = verdict;
    strengthVerdict.classList.remove('badge-weak', 'badge-medium', 'badge-strong');
    strengthVerdict.classList.add(scoreToBadge(score));
  }
  if (entropyEl) entropyEl.textContent = `Entropy: ${entropy} bits`;
  if (crackTimeEl) crackTimeEl.textContent = `Crack time: ${crackTime}`;

  if (suggestionsList) {
    suggestionsList.innerHTML = '';
    if (suggestions.length) {
      if (suggestionsEmpty) suggestionsEmpty.classList.add('hidden');
      suggestionsList.classList.add('visible');
      suggestions.forEach(tip => {
        const li = document.createElement('li');
        li.textContent = tip;
        suggestionsList.appendChild(li);
      });
    } else {
      suggestionsList.classList.remove('visible');
      if (suggestionsEmpty) suggestionsEmpty.classList.remove('hidden');
    }
  }

  const tipsToggle = document.querySelector('[data-toggle-target="tipsContent"]');
  const tipsContent = document.getElementById('tipsContent');
  if (tipsToggle && tipsContent) {
    const wasExpanded = tipsToggle.getAttribute('aria-expanded') === 'true';
    if (suggestions.length) {
      if (!wasExpanded) {
        toggleCollapsible(tipsToggle);
        tipsToggle.dataset.autoOpened = 'true';
      }
    } else {
      if (tipsToggle.dataset.autoOpened === 'true' && wasExpanded) {
        toggleCollapsible(tipsToggle);
      }
      delete tipsToggle.dataset.autoOpened;
    }
  }
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.loading = loading;
}

export async function saveTestedToVault() {
  if (!passwordInput || !passwordInput.value) {
    showToast('Enter a password first.', 'warning');
    return;
  }
  await openEntryModal({
    id: null,
    site: await detectActiveOrigin(),
    username: '',
    password: passwordInput.value,
    notes: ''
  });
}

export function attachTesterListeners() {
  if (passwordInput) {
    passwordInput.addEventListener('input', event => {
      updateStrength(event.target.value);
      if (hibpStatus) {
        hibpStatus.textContent = 'Not checked yet.';
        hibpStatus.className = 'text-muted';
      }
    });
  }

  if (copyTestPasswordBtn) {
    copyTestPasswordBtn.addEventListener('click', async () => {
      if (!passwordInput || !passwordInput.value) {
        showToast('Enter a password first.', 'warning');
        return;
      }
      try {
        await navigator.clipboard.writeText(passwordInput.value);
        showToast('Password copied.', 'success');
      } catch (e) {
        showToast('Clipboard unavailable.', 'warning');
      }
    });
  }

  if (hibpButton) {
    hibpButton.addEventListener('click', async () => {
      if (!passwordInput || !passwordInput.value) {
        showToast('Enter a password to check.', 'warning');
        return;
      }
      setLoading(hibpButton, true);
      if (hibpStatus) {
        hibpStatus.textContent = 'Checking…';
        hibpStatus.className = 'text-muted';
      }
      
      const response = await sendMessage('HIBP_CHECK', { password: passwordInput.value });
      setLoading(hibpButton, false);
      
      if (!response?.ok) {
        if (hibpStatus) {
          hibpStatus.textContent = response?.error || 'Could not check breaches.';
          hibpStatus.className = 'text-warning';
        }
        return;
      }
      
      if (response.result?.compromised) {
        if (hibpStatus) {
          hibpStatus.innerHTML = `<strong class="breach-count">${response.result.count.toLocaleString()}</strong> breaches found`;
          hibpStatus.className = 'text-default';
        }
        showToast(`Password found in ${response.result.count.toLocaleString()} breaches!`, 'error');
      } else {
        if (hibpStatus) {
          hibpStatus.textContent = 'No known breaches found.';
          hibpStatus.className = 'text-success';
        }
        showToast('Password not found in breaches.', 'success');
      }
    });
  }

  if (saveTestedBtn) {
    saveTestedBtn.addEventListener('click', saveTestedToVault);
  }
}
