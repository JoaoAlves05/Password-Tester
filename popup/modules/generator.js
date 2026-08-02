import { sendMessage } from './messaging.js';
import { showToast } from './toast.js';
import { updateStrength } from './tester.js';
import { scheduleSettingsSave, syncSettingsView } from './settings.js';
import { state, setView, detectActiveOrigin, openEntryModal } from '../popup.js';
import { copyToClipboard } from '../../src/utils/clipboard.js';

const lengthRange = document.getElementById('lengthRange');
const lengthValue = document.getElementById('lengthValue');
const includeLower = document.getElementById('includeLower');
const includeUpper = document.getElementById('includeUpper');
const includeNumbers = document.getElementById('includeNumbers');
const includeSymbols = document.getElementById('includeSymbols');
const avoidSimilar = document.getElementById('avoidSimilar');
const generatorStatus = document.getElementById('generatorStatus');
const generateButton = document.getElementById('generatePassword');
const generatedResult = document.getElementById('generatedResult');
const copyGeneratedBtn = document.getElementById('copyGenerated');
const useForTestBtn = document.getElementById('useForTest');
const saveGeneratedBtn = document.getElementById('saveGenerated');

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.loading = loading;
}

export function syncGeneratorControls() {
  if (!state.settings) return;
  if (state.settings.generatorDefaults) {
    const defs = state.settings.generatorDefaults;
    if (lengthRange) lengthRange.value = defs.length || 16;
    if (lengthValue) lengthValue.textContent = defs.length || 16;
    if (includeLower) includeLower.checked = defs.lowercase !== false;
    if (includeUpper) includeUpper.checked = defs.uppercase !== false;
    if (includeNumbers) includeNumbers.checked = defs.numbers !== false;
    if (includeSymbols) includeSymbols.checked = defs.symbols !== false;
  } else {
    if (lengthRange) lengthRange.value = state.settings.minLength;
    if (lengthValue) lengthValue.textContent = state.settings.minLength;
    if (includeLower) includeLower.checked = state.settings.includeLowercase;
    if (includeUpper) includeUpper.checked = state.settings.includeUppercase;
    if (includeNumbers) includeNumbers.checked = state.settings.includeNumbers;
    if (includeSymbols) includeSymbols.checked = state.settings.includeSymbols;
  }
  if (avoidSimilar) avoidSimilar.checked = state.settings.avoidSimilar;
  syncSettingsView();
}

export async function handleGenerate() {
  setLoading(generateButton, true);
  if (generatorStatus) generatorStatus.textContent = '';
  
  const constraints = {
    length: Number(lengthRange.value),
    overrides: {
      minLength: Number(lengthRange.value),
      includeLowercase: includeLower.checked,
      includeUppercase: includeUpper.checked,
      includeNumbers: includeNumbers.checked,
      includeSymbols: includeSymbols.checked,
      avoidSimilar: avoidSimilar.checked
    }
  };
  
  const response = await sendMessage('GENERATE_PASSWORD', { constraints });
  setLoading(generateButton, false);
  
  if (!response?.ok) {
    if (generatorStatus) {
      generatorStatus.textContent = response?.error || 'Could not generate password.';
      generatorStatus.classList.remove('success');
      generatorStatus.classList.add('error');
    }
    return;
  }
  
  state.generatorPassword = response.password;
  if (generatedResult) generatedResult.value = response.password;
  updateStrength(response.password);
  
  if (generatorStatus) {
    generatorStatus.textContent = 'Strong password generated.';
    generatorStatus.classList.remove('error');
    generatorStatus.classList.add('success');
  }
  showToast('New password generated.', 'success');
}

export async function saveGeneratedToVault() {
  if (!generatedResult.value) {
    showToast('Generate a password first.', 'warning');
    return;
  }
  await openEntryModal({
    id: null,
    site: await detectActiveOrigin(),
    username: '',
    password: generatedResult.value,
    notes: ''
  });
}

export function attachGeneratorListeners() {
  if (generateButton) generateButton.addEventListener('click', handleGenerate);

  if (lengthRange) {
    lengthRange.addEventListener('input', event => {
      if (lengthValue) lengthValue.textContent = event.target.value;
    });
    lengthRange.addEventListener('change', () => {
      if (!state.settings) return;
      state.settings.minLength = Number(lengthRange.value);
      scheduleSettingsSave();
    });
  }

  const generatorToggles = [includeLower, includeUpper, includeNumbers, includeSymbols, avoidSimilar];
  generatorToggles.forEach(inputEl => {
    if (inputEl) {
      inputEl.addEventListener('change', () => {
        if (!state.settings) return;
        state.settings.includeLowercase = includeLower.checked;
        state.settings.includeUppercase = includeUpper.checked;
        state.settings.includeNumbers = includeNumbers.checked;
        state.settings.includeSymbols = includeSymbols.checked;
        state.settings.avoidSimilar = avoidSimilar.checked;
        scheduleSettingsSave();
      });
    }
  });

  if (copyGeneratedBtn) {
    copyGeneratedBtn.addEventListener('click', async () => {
      if (!generatedResult.value) {
        showToast('Generate a password first.', 'warning');
        return;
      }
      const ok = await copyToClipboard(generatedResult.value);
      if (ok) {
        showToast('Generated password copied.', 'success');
      } else {
        showToast('Clipboard unavailable.', 'warning');
      }
    });
  }

  if (useForTestBtn) {
    useForTestBtn.addEventListener('click', () => {
      if (!generatedResult.value) {
        showToast('Generate a password first.', 'warning');
        return;
      }
      const passwordInput = document.getElementById('passwordInput');
      if (passwordInput) {
        passwordInput.value = generatedResult.value;
        updateStrength(generatedResult.value);
        setView('tester');
        passwordInput.focus();
      }
    });
  }

  if (saveGeneratedBtn) {
    saveGeneratedBtn.addEventListener('click', saveGeneratedToVault);
  }
}
