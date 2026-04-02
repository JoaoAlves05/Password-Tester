# SecurePass

**SecurePass** is a Local-First Security Suite that analyzes, generates, and protects your passwords directly in your browser.

> 🔒 **Privacy First:** Your data never leaves your device. We use a Zero-Knowledge architecture with AES-256 encryption.

## Features

- **Password Tester:** Real-time strength analysis using entropy heuristics and contextual suggestions. Check if passwords were exposed in known breaches via a k-Anonymity HIBP lookup.
- **Secure Vault:** Store credentials locally with AES-GCM encryption and PBKDF2-derived keys.
- **Smart Generator:** Create cryptographically strong passwords with customizable length, character sets and policy awareness.

## Extension (Browser Extension)

The browser extension is the primary deliverable in this repository. The extension's source files now live in the repository root so you can load the extension directly from the project folder.

### Install (Developer)

1. Clone this repository.
2. Open your browser's extension management page:
	- **Chrome / Edge / Brave:** `chrome://extensions`
	- **Firefox (temporary add-on):** `about:debugging#/runtime/this-firefox`
3. Enable **Developer mode**.
4. Click **Load unpacked** (or **Load Temporary Add-on** in Firefox) and select the repository root folder (the folder you cloned).
5. The extension icon will appear in the toolbar — pin it for quick access.

### Architecture overview

```
.
├── background/
│   └── serviceWorker.js      # Central message router, HIBP requests, vault orchestration
├── content/
│   └── content.js            # Injects SecurePass panel and bridges page interactions
├── popup/
│   ├── popup.html            # Toolbar popup UI
│   ├── popup.js              # Strength analysis, HIBP checks, vault interface
│   └── popup.css             # Popup styling
├── options/
│   ├── options.html          # Settings UI
│   ├── options.js            # Preference persistence
│   └── options.css           # Settings styling
├── src/
│   ├── passwordStrength.js   # Entropy, heuristics, suggestions
│   ├── hibp.js               # k-Anonymity client + caching
│   ├── storage.js            # chrome.storage helpers
│   ├── settings.js           # Defaults + sync/local persistence
│   ├── passwordGenerator.js  # Constraint-aware generator
│   ├── formAnalyzer.js       # Constraint extraction + field discovery
│   └── cryptoVault.js        # AES-GCM vault powered by PBKDF2
├── manifest.json             # Manifest v3 definition
├── icons/                    # Icon assets
├── offscreen.html            # Optional offscreen document
├── offscreen.js              # Offscreen script
└── README.md                 # This document
```

## Development

- The extension is designed to run side-by-side with any `web/` demo in the repo.
- Load the extension as an unpacked extension (select the project root) during development.
- Use `chrome.runtime.sendMessage` for background privileged actions (HIBP, vault, generation).

### Quick checks

- Ensure `manifest.json` is present in the project root after moving files.
- Verify `offscreen.html`/`offscreen.js` and `background/serviceWorker.js` are reachable by the manifest.

## Web Demo

Visit the live demo at: https://JoaoAlves05.github.io/SecurePass/ (if available)

## Security & Privacy

- **No remote code** – CSP restricts execution to bundled assets, forbidding eval and remote scripts.
- **Secrets stay local** – HIBP uses the range API; only SHA-1 prefixes leave the browser.
- **Strong crypto defaults** – PBKDF2 (100k iterations) derives AES-256-GCM keys; salts and IVs generated per vault update.
- **Granular storage** – `chrome.storage.local` is the default; optional sync storing only encrypted preferences.
- **Ephemeral unlocking** – vault auto-lock respects configurable timeout and wipes in-memory keys.

## License

MIT
