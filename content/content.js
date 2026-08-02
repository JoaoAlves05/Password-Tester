(async () => {
  try {
    const [
      { setupShadowDom, initThemeSync },
      { runBiometricAssertion, tryBiometricUnlock },
      { initAutofill, attachButton },
      { observePasswordFields },
      passwordModule
    ] = await Promise.all([
      import(chrome.runtime.getURL('content/modules/ui.js')),
      import(chrome.runtime.getURL('content/modules/biometric.js')),
      import(chrome.runtime.getURL('content/modules/autofill.js')),
      import(chrome.runtime.getURL('src/formAnalyzer.js')),
      import(chrome.runtime.getURL('src/passwordStrength.js'))
    ]);

    const { shadowHost, shadowRoot } = setupShadowDom();
    await initThemeSync(shadowRoot);

    await initAutofill({
      passwordModule,
      runBiometricAssertion,
      tryBiometricUnlock,
      shadowRoot,
      shadowHost
    });

    observePasswordFields((field, constraints) => {
      attachButton(field, constraints);
    });

  } catch (error) {
    console.error('SecurePass: Failed to initialize content script modules.', error);
  }
})();
