# SecurePass Architecture Overview

Welcome to the SecurePass architecture guide. This document explains how the extension is structured, how the different components communicate, and the data flow for the main features.

## High-Level Architecture

SecurePass is built as a Manifest V3 (MV3) Chrome Extension. It follows a strictly modular architecture divided into four main layers:

1. **Background Service Worker (`background/`)**: The central brain and message router.
2. **Core Source (`src/`)**: Shared utilities, cryptography, and business logic.
3. **Popup Interface (`popup/`)**: The main user interface when clicking the extension icon.
4. **Content Scripts (`content/`)**: The inline tools injected directly into web pages (e.g., the autofill overlay).
5. **Auth Iframe (`auth/`)**: A dedicated environment for handling WebAuthn (Biometric) interactions.

---

## Directory Structure

```text
SecurePass/
├── background/
│   └── serviceWorker.js       # Thin orchestrator that routes messages
├── src/
│   ├── messageHandlers/       # Modules handling specific background events
│   │   ├── vaultHandlers.js
│   │   ├── biometricHandlers.js
│   │   └── utilHandlers.js
│   ├── cryptoVault.js         # Encryption/Decryption logic (AES-GCM)
│   ├── encoding.js            # Safe Base64 <-> ArrayBuffer conversions
│   ├── hibp.js                # Have I Been Pwned API integration & caching
│   ├── constants.js           # Global constants (DB names, alarms)
│   ├── passwordGenerator.js   # Logic for generating passwords
│   ├── passwordStrength.js    # Logic for evaluating password strength
│   └── utils/
│       └── storage.js         # IndexedDB & Chrome Storage wrappers
├── popup/
│   ├── popup.html             # Main popup UI
│   ├── popup.js               # Bootstrap script & WebAuthn registration logic
│   └── modules/               # UI modules (vault, generator, tester, etc.)
├── content/
│   ├── content.js             # Bootstrap script injected into pages
│   └── modules/               # Dynamically imported modules (ui, autofill, biometric)
├── auth/
│   ├── auth.html              # Iframe for WebAuthn context
│   └── auth.js                # WebAuthn assertion (authentication) logic
└── manifest.json              # Extension manifest (MV3)
```

---

## Core Components & Data Flow

### 1. The Background Message Router
Instead of a massive `switch/case` statement, `serviceWorker.js` uses a **Map-based router**. When a part of the extension (like the popup or content script) needs to do something complex, it sends a message via `chrome.runtime.sendMessage`. 

The service worker looks up the message type in its `Map` and delegates the work to a specific handler in `src/messageHandlers/`. This keeps the background script thin and scalable.

### 2. Vault Storage & Encryption
- **IndexedDB**: The encrypted vault is stored here because `chrome.storage.local` has tight quota limits.
- **Encryption**: `src/cryptoVault.js` uses native Web Crypto API (`AES-GCM`). 
- **Session State**: When you unlock the vault, the derived master key is held temporarily in `chrome.storage.session`. This ensures the vault locks automatically when the browser is closed or after an inactivity timeout.

### 3. Content Scripts & Inline Autofill
- `content.js` is injected into every web page. It dynamically imports its modules (`ui.js`, `autofill.js`, `biometric.js`) using ES module syntax.
- **Shadow DOM**: The floating SecurePass button and the autofill panel are created inside a Shadow DOM. This guarantees that the host website's CSS won't break the extension's UI, and the extension's CSS won't leak onto the page.
- **Autofill Flow**:
  1. The user focuses a password field.
  2. The content script detects it and shows the floating button.
  3. Clicking the button opens the autofill panel.
  4. If the vault is locked, the user can unlock it via master password or Biometrics (WebAuthn).
  5. Once unlocked, clicking a saved credential instantly fills the form.

### 4. Biometric Authentication (WebAuthn PRF)
SecurePass uses the WebAuthn PRF (Pseudo-Random Function) extension to derive an encryption key from your biometrics (like Touch ID or Windows Hello).
- **The Challenge**: Content scripts and Service Workers cannot reliably invoke WebAuthn on the extension's origin.
- **The Solution**: Registration (`navigator.credentials.create`) is performed directly in the trusted context of the extension popup (`popup/popup.js`). For authentication during autofill, the extension injects a hidden iframe (`auth/auth.html`) hosted on the extension's origin. The iframe securely handles the WebAuthn assertion and communicates the PRF output back to the service worker to unlock the vault.

### 5. HIBP (Have I Been Pwned)
- When evaluating a password, the extension hashes it using SHA-1.
- It sends *only the first 5 characters* of the hash to the HIBP API (k-Anonymity model).
- The results are cached in `chrome.storage.local` using an LRU (Least Recently Used) strategy inside `src/hibp.js` to prevent memory leaks and API rate limits.

---

## Expanding the Extension

If you want to add new features, follow the established patterns:
1. **New UI in Popup**: Create a new module in `popup/modules/` and import it into `popup.js`.
2. **New Background Logic**: Create a new handler in `src/messageHandlers/` and register it in the router inside `serviceWorker.js`.
3. **New Page Interactions**: Add logic to `content/modules/` and ensure the module is listed in `web_accessible_resources` inside `manifest.json`.
