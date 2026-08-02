<div align="center">

<img src="icons/icon-128.png" alt="SecurePass Logo" width="96" />

# SecurePass

**A zero-knowledge, locally-encrypted password manager built as a browser extension**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)](manifest.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/JoaoAlves05/SecurePass/pulls)

*Generate · Analyse · Store — entirely on your device.*

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Security Architecture](#security-architecture)
- [Project Structure](#project-structure)
- [Module Reference](#module-reference)
- [Permissions Explained](#permissions-explained)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

SecurePass is a **Manifest V3** browser extension that gives users full control over their credentials without ever sending sensitive data to a third-party server. Every cryptographic operation - key derivation, encryption, and decryption - runs entirely inside the browser using the native **Web Crypto API**.

The extension ships three integrated tools accessible from the popup:

| Tab | Purpose |
|---|---|
| **Tester** *(default)* | Real-time password strength analysis with entropy scoring, crack-time estimation, HIBP breach check, and a "Save to vault" shortcut |
| **Generator** | Generates cryptographically secure passwords — configurable length, character sets, and "avoid similar characters" toggle, with a "Save to vault" shortcut |
| **Vault** | Locked/unlocked credential store with search, add, edit, and delete - protected by a master password, PRF-backed biometric unlock, or optional Trusted Device mode |

A persistent **content script** enriches every web page with an inline assistant: it detects password fields, surfaces saved credentials for autofill, offers one-click generation, and prompts to save new credentials after form submission.

---

## Key Features

### 🔐 Local Encrypted Vault
- All credentials are stored in **IndexedDB** (default) or `chrome.storage.sync` (optional, for cross-device sync).
- The vault is protected by a **master password** — never stored in plaintext, never sent over the network.
- A **metadata layer** (`id`, `username`, `site`) is stored separately, allowing the extension to show credential stubs even when the vault is locked.

### 🛡️ Biometric Unlock (WebAuthn + PRF)
- **PRF-backed unlock** is the preferred path. When the authenticator exposes WebAuthn PRF output, the vault unlocks without asking for the master password.
- **Verify-only fallback** uses Windows Hello / Touch ID / device PIN to verify identity, then seeds the browser session once with the master password on non-PRF devices.
- **Trusted Device mode** is optional and disabled by default. It stores a local unlock secret on the device so biometric unlock can continue after browser restarts on non-PRF hardware.
- The master password is encrypted with an AES-256-GCM key derived from the biometric PRF output via **HKDF-SHA-256**; on non-PRF devices it falls back to verify-only or Trusted Device mode depending on the user's explicit preference.
- The setup flow detects PRF capability during a real assertion, not just during credential creation, so the saved mode matches actual device behaviour.
- Registration and management of biometric unlock live in the popup's **Settings panel → Security** section. Once enabled, a **Biometric Unlock** button appears on the vault unlock screen.

### ⚡ Intelligent Inline Assistant
- A small floating button appears next to every `<input type="password">` field on any website.
- **Context-aware**: distinguishes between *Login* forms (shows autofill stubs) and *Register* forms (shows the generator + strength meter).
- Automatically detects HTML5 field constraints (`minlength`, `maxlength`, `pattern`) and respects site-specific character requirements.
- The panel is draggable, supports Light/Dark/System themes, and is fully keyboard-accessible.

### 🔎 Have I Been Pwned (HIBP) Breach Check
- Checks whether a password has appeared in known data breaches via the [HIBP Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords).
- Uses **k-Anonymity**: only the first 5 characters of the SHA-1 hash are transmitted; the full hash never leaves the browser.
- Results are **locally cached** (configurable TTL, default 24 h) to minimise API calls.
- Available both in the **Tester** popup tab and on the inline assistant panel.

### 🔒 Auto-Lock & Brute-Force Protection
- Configurable inactivity timeout (1 – 60 min, default 15 min) via both the **Chrome Alarms API** and **Idle API** for redundancy.
- On lock, sensitive data is **zeroed out in memory** before the cache is cleared.
- After 5 consecutive failed unlock attempts a 30-second lockout is triggered. Both thresholds are defined as named constants (`BRUTE_FORCE_MAX_ATTEMPTS`, `BRUTE_FORCE_LOCKOUT_MS`) in `cryptoVault.js`.
- The vault also auto-locks when the OS reports an idle or locked state.

### ☁️ Safe Chrome Sync
- Chrome Sync is gated behind a **safe activation flow**.
- If local and sync vault records both exist and differ, SecurePass stops and asks for an explicit choice instead of overwriting silently.
- You can keep Local, use Sync, or cancel and merge manually through export/import.

### ⚙️ Two Settings Surfaces

**Popup Settings panel** (gear icon ⚙ in the popup header):
- Light / Dark / System theme toggle
- Auto-lock vault timeout slider (1 – 60 min)
- Clipboard auto-clear timeout slider
- Change Master Key
- Set up / Disable Biometric Unlock *(Security section)*
- Trusted Device mode toggle *(optional, off by default, with risk warning)*
- Chrome Sync toggle
- Export Vault (JSON), Import Vault (JSON), Clear Vault

**Options page** (right-click the extension icon → *Options*, or from the About section):
- Appearance (theme)
- Security (vault timeout, clipboard timeout, HIBP cache TTL sliders)
- Generator Defaults (default length, character sets)
- Sync (Chrome Sync toggle with safe conflict resolution)
- Data Management (Reset Settings, Export Vault, Import Vault, Clear All Data)

---

## Security Architecture

```
  Master Password
        │
        ▼
  ┌──────────────┐    PBKDF2-SHA256     ┌───────────────┐
  │  Passphrase  │ ──────────────────► │  AES-256-GCM  │
  │  (in memory  │   600 000 iters      │  Vault Key    │
  │   only)      │   16-byte salt       └───────────────┘
  └──────────────┘                             │
                                               ▼
                                   Encrypt({ entries: [...] })
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │  Ciphertext Blob │
                                    │  stored locally  │
                                    │  (IndexedDB /    │
                                    │   chrome.storage)│
                                    └──────────────────┘

  Biometric Path (WebAuthn PRF):
  ─────────────────────────────
  PRF Output ──HKDF-SHA256──► AES-256-GCM key ──► decrypt(masterPassword)
                                                         │
                                                         ▼
                                                   unlock vault

   Non-PRF Paths:
   ───────────────
   WebAuthn verification ──► session seed (default fallback)
                                       └─► trusted-device local secret (opt-in)
```

| Property | Value |
|---|---|
| Key derivation | PBKDF2-SHA256, 600 000 iterations |
| Vault cipher | AES-256-GCM |
| IV | 96-bit random per encryption |
| Salt | 128-bit random per vault init |
| Biometric key | HKDF-SHA256 from WebAuthn PRF output |
| Trusted Device key | Local device-only AES-256-GCM wrapping key |
| HIBP privacy | k-Anonymity (5-char SHA-1 prefix only) |
| Plaintext stored | **Never** |

---

## Project Structure

```
SecurePass/
├── manifest.json              # Extension manifest (Manifest V3)
├── background/
│   └── serviceWorker.js       # Background service worker — message handler & auto-lock
├── content/
│   └── content.js             # Inline assistant injected into every web page
├── popup/
│   ├── popup.html             # Extension popup (Tester / Generator / Vault tabs + Settings panel)
│   ├── popup.css              # Popup styles (glassmorphism, dark/light theme)
│   └── popup.js               # Popup logic
├── options/
│   ├── options.html           # Standalone settings page (opened via right-click → Options)
│   ├── options.css            # Settings page styles
│   └── options.js             # Settings logic (import/export, data management)
├── auth/
│   ├── auth.html              # WebAuthn helper page loaded during biometric flow
│   └── auth.js                # Triggers navigator.credentials.get() for biometric assertion
├── src/
│   ├── cryptoVault.js         # Core vault: PBKDF2, AES-GCM, biometric PRF helpers
│   ├── passwordGenerator.js   # Cryptographically secure password generation (CSPRNG)
│   ├── passwordStrength.js    # Entropy scoring, crack-time estimation, suggestions
│   ├── hibp.js                # HIBP k-Anonymity check with local caching
│   ├── formAnalyzer.js        # Form context detection & HTML5 constraint extraction
│   ├── validation.js          # Input sanitisation and validation (XSS-safe)
│   ├── settings.js            # Settings load/save with sync support
│   ├── encoding.js            # Base64 encode/decode helpers
│   ├── logger.js              # Secure, redaction-aware logger with in-memory ring buffer
│   └── utils/
│       └── storage.js         # Unified chrome.storage & IndexedDB abstraction
├── offscreen.html             # Offscreen document for clipboard operations (MV3)
└── offscreen.js               # Clipboard clear logic
```

---

## Module Reference

### `src/cryptoVault.js`

The cryptographic backbone of the extension.

| Export | Signature | Description |
|---|---|---|
| `vaultStatus` | `() → { initialized, unlocked }` | Returns current vault state |
| `initializeVault` | `(passphrase) → bool` | Creates a new encrypted vault |
| `unlockVault` | `(passphrase, timeoutMin?) → data` | Decrypts and caches vault data |
| `lockVault` | `() → void` | Zeros memory and evicts the cache |
| `storeCredential` | `(entry, passphrase) → entry` | Adds a credential to the vault |
| `updateCredential` | `(id, updates, passphrase) → entry` | Updates an existing credential |
| `deleteCredential` | `(id, passphrase) → void` | Removes a credential |
| `listCredentials` | `() → entry[]` | Returns all decrypted credentials |
| `listCredentialsMeta` | `() → stub[]` | Returns credential stubs (no passwords) |
| `changeMasterPassword` | `(old, new) → void` | Re-encrypts vault with a new password |
| `importVaultData` | `(data, passphrase) → count` | Merges entries from a JSON export |
| `saveBiometricSetup` | `(credId, encPass, prfAvailable, mode?) → void` | Persists biometric registration data and unlock mode |
| `decryptPassphraseWithPRF` | `(encData, prfB64) → passphrase` | Recovers master password via WebAuthn PRF output |
| `encryptPassphraseWithTrustedDevice` | `(passphrase) → wrappedPassphrase` | Stores a device-local secret for Trusted Device mode |
| `decryptPassphraseWithTrustedDevice` | `(wrappedPassphrase) → passphrase` | Restores the passphrase from the device-local secret |
| `clearTrustedDeviceKey` | `() → void` | Removes the device-local secret |

### `src/passwordGenerator.js`

| Export | Signature | Description |
|---|---|---|
| `generatePassword` | `(constraints?) → string` | Generates a CSPRNG password respecting site constraints |

Constraints accepted: `length`, `minLength`, `maxLength`, `pattern` (regex), `customRequirements` (`requiresUppercase`, `requiresLowercase`, `requiresNumber`, `requiresSymbol`), `avoidSimilar`.

### `src/passwordStrength.js`

| Export | Signature | Description |
|---|---|---|
| `evaluatePassword` | `(password) → result` | Returns `{ score, verdict, entropy, suggestions, crackTime }` |

Verdicts: `Weak` · `Fair` · `Strong` · `Excellent`

### `src/hibp.js`

| Export | Signature | Description |
|---|---|---|
| `checkPassword` | `(password) → { compromised, count }` | Checks against HIBP via k-Anonymity |

### `src/formAnalyzer.js`

| Export | Signature | Description |
|---|---|---|
| `observePasswordFields` | `(callback) → void` | Registers a MutationObserver for dynamic password fields |
| `extractConstraints` | `(field) → constraints` | Extracts HTML5 constraints from a password input |
| `analyzeFormContext` | `(field) → { context, usernameField, confirmField }` | Detects login vs. register form context |

---

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | Detect the current page URL to match saved credentials |
| `tabs` | Communicate between the popup/background and the active tab |
| `storage` | Persist the vault, settings, and HIBP cache |
| `alarms` | Schedule auto-lock and clipboard clear timers |
| `idle` | Detect OS-level idle/locked state to trigger automatic vault lock |
| `offscreen` | Run clipboard-clearing logic in an offscreen document (MV3 requirement) |
| `clipboardWrite` | Copy generated or stored passwords to the clipboard |
| `notifications` | Prompt the user to save credentials after form submission |
| `windows` | Manage the WebAuthn authentication window during biometric flow |
| `host_permissions: api.pwnedpasswords.com` | Fetch k-Anonymity range responses from HIBP |

---

## Getting Started

### Prerequisites

- Google Chrome **≥ 116** (or any Chromium-based browser with MV3 support)
- No build step required — the extension runs as plain ES Modules

### Load as Unpacked Extension

```bash
git clone https://github.com/JoaoAlves05/SecurePass.git
```

1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the cloned `SecurePass/` folder.
4. The SecurePass icon will appear in your extensions toolbar.

> **Tip:** Pin the extension to the toolbar for faster access.

---

## Usage Guide

### Popup Layout

The popup opens on the **Tester** tab by default. Three navigation tabs run across the top:
**Generator** | **Tester** | **Vault**

A **gear icon ⚙** in the top-right corner opens the in-popup **Settings panel**, which slides in over the main content.

---

### Tester Tab — Analyse a Password

1. Click the **SecurePass** icon → lands on the **Tester** tab.
2. Type or paste any password in the input field.
3. Instantly see:
   - Strength verdict (`Weak` / `Fair` / `Strong` / `Excellent`)
   - Entropy in bits and estimated crack time
   - A list of improvement suggestions
4. Click **Check for breaches** to run a HIBP k-Anonymity check.
5. Click **Save to vault** to store the tested password directly in the vault.

---

### Generator Tab — Create a Secure Password

1. Switch to the **Generator** tab.
2. Drag the **Length** slider (6 – 64 characters, default 16).
3. Toggle the character sets: **A-Z**, **a-z**, **0-9**, **!@#** (symbols).
4. Optionally enable **Avoid similar characters** (removes `I`, `l`, `1`, `O`, `0`).
5. Click **Generate** — a cryptographically random password fills the output field.
6. Use the **copy** icon to copy it to the clipboard (auto-clears after the configured timeout).
7. Use the **→** icon to send the password directly to the **Tester** tab for strength analysis.
8. Click **Save to vault** to store it immediately.

---

### Vault Tab — Store and Manage Credentials

**First use — Create your vault:**
1. Switch to the **Vault** tab.
2. Enter and confirm a strong master password, then click **Create vault**.
   The vault is initialised with AES-256-GCM; the master password is never stored in plaintext.

**Unlock an existing vault:**
1. Enter your master password and click **Unlock vault**, or
2. If biometric unlock is configured, click **Biometric Unlock** (the button appears automatically on the unlock screen when biometrics are enabled).
3. If your device supports PRF, SecurePass unlocks the vault directly after Windows Hello / Touch ID.
4. If PRF is unavailable, SecurePass falls back to verify-only mode or Trusted Device mode depending on your settings.

**When unlocked**, the vault shows your credential list with:
- **Search** — filter credentials by username or site.
- **+ (Add)** — open a form to manually enter site, username, password, and optional notes.
- **Lock** (padlock icon) — immediately locks the vault.
- Each credential card can be expanded to **copy**, **edit**, or **delete** it.

---

### Settings Panel (Popup ⚙)

Click the **gear icon ⚙** in the popup to open the Settings panel. It contains:

**Appearance**
- Theme: System / Light / Dark

**Security**
- Auto-lock vault timeout slider (1 – 60 min)
- Clear clipboard after timeout slider
- **Change Master Key** — enter current and new password
- **Set up Biometric Unlock** / **Disable Biometric Unlock**
  - Registers a WebAuthn passkey on your device (fingerprint, Face ID, or PIN)
   - PRF-backed devices unlock without the master password
   - Non-PRF devices can use verify-only fallback or Trusted Device mode
  - Once enabled, the "Biometric Unlock" button appears on the vault lock screen
  - Only available when the vault is unlocked
 - **Trusted Device mode** — stores a device-local secret so biometric unlock survives browser restarts on non-PRF devices

**Sync**
- Chrome Sync toggle — stores the encrypted vault in `chrome.storage.sync` for cross-device access
- If local and sync copies diverge, SecurePass prompts before switching instead of overwriting silently

**Data Management**
- **Reset Settings** — restore generator and security defaults
- **Export Vault** — download all credentials as a JSON file (vault must be unlocked)
- **Import Vault** — merge credentials from a previously exported JSON file
- **Clear Vault** — permanently delete all vault data (requires confirmation)

---

### Inline Assistant (on any website)

- A small **🔑 button** appears to the right of every password input field.
- **On login forms**: shows matching saved credentials and lets you autofill with one click (if the vault is unlocked; otherwise prompts for the master password inline).
- **On registration forms**: shows the strength meter, lets you generate a password, and offers a "Save credential" button.
- After submitting a form with a new password, a **browser notification** appears asking whether to save the credential to the vault.

---

### Options Page

Access via right-click on the extension icon → *Options*. This is a full-page settings interface with:
- **Appearance** — theme selection
- **Security** — vault timeout, clipboard clear timeout, HIBP cache TTL
- **Generator Defaults** — saved default length and character set preferences
- **Sync** — Chrome Sync toggle
- **Data Management** — Reset Settings, Export Vault, Import Vault, Clear All Data (requires master password re-entry)

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Open an issue** before starting work on a significant change.
2. Fork the repository and create a **feature branch** (`git checkout -b feature/my-feature`).
3. Keep pull requests focused and small.
4. If you touch any cryptographic logic, include tests or a clear manual verification procedure.
5. Submit a PR with a clear description of what changed and why.

```bash
# Clone your fork
git clone https://github.com/<your-username>/SecurePass.git

# Create a feature branch
git checkout -b feature/my-feature

# Load into Chrome as an unpacked extension (see Getting Started) and test your changes

# Push and open a PR
git push origin feature/my-feature
```

---

## Biometric Compatibility Notes

SecurePass uses a tiered biometric strategy:

1. **PRF available**: true passwordless biometric unlock.
2. **PRF unavailable**: verify identity with Windows Hello / Touch ID, then use a one-time session seed.
3. **Trusted Device enabled**: optional persistent device-local unlock for users who want biometrics-only convenience on hardware without PRF.

The popup now reflects the actual configured mode, so you can tell whether a device is running PRF-backed unlock, verify-only, or Trusted Device mode.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ by [João Alves](https://github.com/JoaoAlves05)  
[Report a Bug](https://github.com/JoaoAlves05/SecurePass/issues) · [Request a Feature](https://github.com/JoaoAlves05/SecurePass/issues)

</div>
