# Dosh

A local-first social media manager for app promotion. Built with Tauri, React, and SQLite — your posts, assets, and API keys never leave your machine.

---

## Prerequisites

Before you start, make sure you have the following installed:

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain via `rustup`)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your OS:
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`)
  - **Linux** — `webkit2gtk`, `build-essential`, `libssl-dev` (see Tauri docs)
  - **Windows** — Microsoft Visual Studio C++ Build Tools + WebView2

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/Dosh.git
cd Dosh
```

### 2. Install dependencies

```bash
npm install
```

### 3. Add the base64 Rust crate

Open `src-tauri/Cargo.toml` and add the following line under `[dependencies]`:

```toml
base64 = "0.22"
```

This is required for the high-res media preview feature.

### 4. Run in development mode

```bash
npm run dev
```

This starts the Vite dev server on `http://localhost:1420` and launches the Tauri window. Hot-reload is enabled for the React frontend.

### 5. Build for production

```bash
npm run build
```

The packaged app will be output to `src-tauri/target/release/bundle/`.

---

## Project Structure

```
Dosh/
├── src/                        # React frontend (Vite + TypeScript)
│   ├── App.tsx                 # Root layout — sidebar with Drafts, Queue, Assets
│   ├── components/
│   │   └── PostEditor.tsx      # Markdown editor with live preview
│   └── lib/
│       └── db.ts               # TypeScript wrapper for SQLite (posts + assets)
├── src-tauri/                  # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs             # Tauri entry point
│   │   └── lib.rs              # Commands: save_post, get_posts, secure_store_key, read_media_file
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri app configuration
├── tailwind.config.ts
└── vite.config.ts
```

---

## Features

- **Drafts** — Write and save posts in a live markdown editor with per-platform character counting.
- **Queue** — Schedule posts with a date/time picker; queued items are stored locally in SQLite.
- **Assets** — Import and browse app screenshots and videos. Full-resolution previews are rendered via a native Rust command (no temp files written to disk).
- **Secure key storage** — API keys are stored in the OS keychain (macOS Keychain, Windows Credential Manager, or libsecret on Linux) via the `secure_store_key` Tauri command.
- **Dark / light mode** — Toggle via the sidebar; preference is persisted across sessions.

---

## Storing API Keys

Call the `secure_store_key` Tauri command from the frontend to save credentials:

```ts
import { invoke } from "@tauri-apps/api/core";

// Save
await invoke("secure_store_key", {
  service: "dosh.twitter",
  account: "api_key",
  secret: "your-api-key-here",
});

// Retrieve
const key = await invoke<string>("secure_get_key", {
  service: "dosh.twitter",
  account: "api_key",
});

// Delete
await invoke("secure_delete_key", {
  service: "dosh.twitter",
  account: "api_key",
});
```

Keys are stored in the native OS keychain and are never written to disk in plaintext.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS (dark mode via `class`) |
| Editor | `@uiw/react-md-editor` |
| Backend | Tauri 2 (Rust) |
| Database | SQLite via `tauri-plugin-sql` |
| Keychain | `keyring` crate (cross-platform) |

---

## License

MIT
