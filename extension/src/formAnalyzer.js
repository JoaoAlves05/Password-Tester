export function analyzeFormContext(field) {
  const form = field.form || field.closest('form');
  let context = 'unknown';
  let usernameField = null;
  let confirmField = null;

  if (form) {
    const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([style*="display: none"]):not([style*="display:none"])'));
    const passwordFields = inputs.filter(el => el.type === 'password' || el.dataset.password === 'true');
    const textFields = inputs.filter(el => ['text', 'email'].includes(el.type) || (el.name && (el.name.toLowerCase().includes('user') || el.name.toLowerCase().includes('email'))));
    
    // Find confirm field (usually the second password field)
    confirmField = passwordFields.find(el => el !== field && el.getBoundingClientRect().top >= field.getBoundingClientRect().top);
    if (!confirmField) {
      confirmField = passwordFields.find(el => el !== field);
    }
    
    // Find username field (usually the closest text/email field before password)
    const fieldIndex = inputs.indexOf(field);
    if (fieldIndex > 0) {
       for(let i = fieldIndex - 1; i >= 0; i--) {
          if (textFields.includes(inputs[i])) {
             usernameField = inputs[i];
             break;
          }
       }
    }
    if (!usernameField && textFields.length > 0) usernameField = textFields[0];

    const formAction = (form.getAttribute('action') || '').toLowerCase();
    const formText = form.innerText.toLowerCase();
    
    const isRegister = confirmField || passwordFields.length > 1 || 
      ['register', 'signup', 'sign up', 'create', 'join'].some(k => formText.includes(k) || formAction.includes(k.replace(' ', '')));
      
    const isLogin = !isRegister && passwordFields.length === 1 && 
      ['login', 'signin', 'sign in', 'log in', 'auth'].some(k => formText.includes(k) || formAction.includes(k.replace(' ', '')));

    if (isRegister) context = 'register';
    else if (isLogin) context = 'login';
    else context = 'unknown'; // could just be a 1-step thing
  } else {
    const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
    const idx = allInputs.indexOf(field);
    if (idx > 0) {
      const prev = allInputs[idx - 1];
      if (['text', 'email'].includes(prev.type)) {
        usernameField = prev;
      }
    }
    context = 'unknown';
  }

  return { context, usernameField, confirmField };
}

export function extractConstraints(field) {
  const minAttr = parseInt(field.getAttribute('minlength') || '0', 10);
  const maxAttr = parseInt(field.getAttribute('maxlength') || '0', 10);
  const min = Number.isFinite(minAttr) && minAttr > 0 ? minAttr : 0;
  const max = Number.isFinite(maxAttr) && maxAttr > 0 ? maxAttr : 0;
  const pattern = field.getAttribute('pattern');
  const title = field.getAttribute('title') || '';
  const datasetPattern = field.dataset.pattern || null;

  const { context, usernameField, confirmField } = analyzeFormContext(field);

  const custom = {
    requiresUppercase: /uppercase|capital/i.test(title),
    requiresLowercase: /lowercase/i.test(title),
    requiresNumber: /number|digit/i.test(title),
    requiresSymbol: /special|symbol/i.test(title)
  };

  const minLength = Math.max(min, 8);
  const maxLength = max ? Math.max(minLength, max) : Math.max(minLength + 4, 128);

  return {
    minLength,
    maxLength,
    pattern: datasetPattern || pattern || null,
    confirmField,
    usernameField,
    context,
    notes: title,
    customRequirements: custom
  };
}

export function observePasswordFields(callback) {
  const seen = new WeakSet();
  function process(root = document) {
    const fields = root.querySelectorAll('input[type="password"]:not([data-securepass])');
    fields.forEach(field => {
      if (seen.has(field)) return;
      seen.add(field);
      field.dataset.securepass = '1';
      callback(field, extractConstraints(field));
    });
  }

  process();

  let timeoutId = null;
  const debouncedProcess = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (window.requestIdleCallback) {
        requestIdleCallback(() => process(document.documentElement), { timeout: 1000 });
      } else {
        process(document.documentElement);
      }
    }, 300); // 300ms debounce
  };

  const observer = new MutationObserver(mutations => {
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasAddedNodes) {
      debouncedProcess();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
