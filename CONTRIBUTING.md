# Contributing to LensUI

Thank you for helping build **LensUI** — an open-source, obsidian-monochrome desktop shell for Windows with native Win32 speed and local AI desktop control.

## Development Setup

### Prerequisites
- **Windows 10 (1809 or newer) or Windows 11** (x64). Window frame colours, rounded corners and glass need Windows 11.
- **Rust** (`rustup` stable toolchain with MSVC)
- **Bun** (`bun.sh`) or Node.js 20+
- **WebView2 Runtime** (pre-installed on Windows 11 and current Windows 10)

### Run Locally
```bash
bun install
bun run tauri dev
```

### Verify Builds
```bash
bun run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Contributing Theme Packs, Dock Styles & Features

1. Follow [`DESIGN.md`](./DESIGN.md) for visual harmony (grounded chrome, full-color dock icons, `0px`-gap flush flow-outs, readable typography).
2. Follow [`AGENTS.md`](./AGENTS.md) for safety (100% reversible OS hooks, zero PII, anti-cheat exclusions).
3. See [`docs/THEMES_ROADMAP.md`](./docs/THEMES_ROADMAP.md) for the Theme Pack & Dock Style specification and visual parity testing checklist.
4. Never commit personal paths, API keys, `.env` files, or third-party `.exe` installers.
