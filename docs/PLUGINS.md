# Lens UI Plugins

Plugins are small HTML widgets for the Top Bar, the Dock and the Widget Drawer. They are
**off until you turn them on** in Control Center → Plugins, and each one runs in a sealed
sandbox: no internet, no files, no system access, only the permissions it lists.

## Where they live

```
%APPDATA%\LensUI\plugins\<id>\lensplugin.json
%APPDATA%\LensUI\plugins\<id>\index.html
%APPDATA%\LensUI\plugin-data\<id>.json        (its "storage", kept across reinstalls)
%APPDATA%\LensUI\plugins-state.json           (on/off, approvals, pending requests)
```

Four examples are copied there on first run, all switched off: **Clock**, **CPU & Memory**,
**Weather (placeholder)** and **Pomodoro**.

## Manifest — `lensplugin.json`

```json
{
  "id": "cpu-sparkline",              // 1–40 chars: a-z, 0-9, "-"; must equal the folder name
  "name": "CPU & Memory",             // up to 48 chars
  "version": "1.0.0",
  "author": "You",
  "description": "Live CPU sparkline.", // up to 200 chars
  "slot": "topbar-right",             // topbar-left | topbar-right | dock | widgets
  "entry": "index.html",              // relative path to a self-contained .html file
  "permissions": ["telemetry"],       // see below; unknown permissions are rejected
  "refreshIntervalMs": 2000,          // 0 = never, else 1000..3600000: how often you get "tick"
  "width": 150,                       // Top Bar: CSS px (16..320). Dock items are always square.
  "height": 120                       // Widget Drawer: CSS px (16..480)
}
```

**The entry file must be self-contained.** Put CSS in `<style>` and JS in `<script>`;
images as `data:` URLs. External files, links, frames, forms, `<base>` and `<meta http-equiv>`
are removed before the plugin runs.

## Permissions

| Permission | What it allows |
| :--- | :--- |
| *(none)* | Time and theme colours only. |
| `telemetry` | Read CPU %, memory %, used/total GB, uptime. |
| `media` | Read the now-playing title, artist, album, app and artwork. |
| `storage` | Keep up to 64 values / 32 KB of its own data. |
| `notifications` | Show a Lens notification (title ≤ 80, body ≤ 200 chars, at most one per 10 s). |
| `launch-apps` | Start a Start-menu app by name — **each app only after you approve it once**. |
| `open-urls` | Open an `https://` link in your browser — **each site only after you approve it once**. |

Approvals appear in Control Center → Plugins (and inline on Widget Drawer plugins). You can
reset a plugin's approvals at any time.

## API inside a plugin

```js
lens.theme                                  // last theme tokens received (also as CSS variables)
lens.on("tick",  (now)   => { ... })        // every refreshIntervalMs while visible
lens.on("theme", (vars)  => { ... })        // the user changed theme

await lens.request("time.now")
await lens.request("theme.get")
await lens.request("telemetry.get")         // { cpuUsage, memPercent, memUsedGb, memTotalGb, uptimeMinutes }
await lens.request("media.get")             // { hasSession, isPlaying, title, artist, album, sourceApp, thumbnailDataUrl }
await lens.request("storage.get", { key })  // string | null
await lens.request("storage.set", { key, value })   // value: string ≤ 4 KB, or null to delete
await lens.request("notify", { title, body })
await lens.request("apps.launch", { name: "Notepad" })
await lens.request("url.open", { url: "https://example.com/page" })
```

Failed requests reject with one of: `permission-denied`, `approval-required`,
`rate-limited`, `unknown-method`, `bad-params`, `unavailable`, `timeout`.

CSS variables available: `--lens-fg`, `--lens-fg-secondary`, `--lens-fg-muted`,
`--lens-on-fg`, `--lens-ink` (use as `rgb(var(--lens-ink) / 0.1)`), `--lens-accent`,
`--lens-accent-safe` (the accent, or the text colour when the accent would be unreadable),
`--lens-radius`, `--font-sans`, `--lens-scheme` (`dark` / `light`).

## Security model

- **Sandbox:** `<iframe sandbox="allow-scripts" srcdoc>` — an opaque origin: no cookies,
  storage, parent DOM, Tauri `invoke()`, popups, top navigation, forms, dialogs or downloads.
  Camera, microphone, clipboard, USB and similar features are denied with `allow`.
- **No network:** a CSP at the top of every plugin document allows only inline script/style and
  `data:` images/fonts (`connect-src`, `frame-src`, `worker-src`, `object-src` are `'none'`).
  WebRTC constructors are removed. The host window adds `frame-src 'none'`, so a plugin cannot
  navigate its own frame to a web page to carry data out in the URL.
- **Bridge:** the only way out is `postMessage`. The host accepts messages only from that
  plugin's own frame, caps them at 16 KB, rate-limits to 20/s (burst 40), and stops a plugin
  after 50 violations. Every method is checked against the manifest's permissions.
- **Approvals:** `launch-apps` and `open-urls` also need a per-app / per-site approval, recorded
  in `plugins-state.json` and checked again in Rust (`check_plugin_launch`, `check_plugin_open_url`)
  before anything is launched.
- **Install:** folders and `.zip` files are read in the browser and written by Rust after
  validation: at most 200 files, 2 MB each, 8 MB total; only web file types; no `..`, absolute
  paths, drive letters, alternate data streams, reserved device names or duplicate names. A new
  version is written to a staging folder and swapped in whole. Plugins are installed off.

## Theme sharing

Control Center → **Share Themes**:

- **Export to file…** saves the current look as a `.lenstheme` wherever you choose.
- **Import file…** applies a `.lenstheme` someone sent you and adds it to your saved themes.
  Every field is validated and clamped (opacity 40–100%, corners 0–20 px); custom CSS is never
  imported.
- **Open gallery…** reads a gallery index file (below). Lens does not download anything yet,
  so only entries that carry their theme inline can be applied; previews must be `data:` images.

### Gallery index format

```json
{
  "lensGallery": 1,
  "name": "Community picks",
  "updated": "2026-11-21",
  "themes": [
    {
      "id": "dusk",
      "name": "Dusk",
      "author": "ava",
      "description": "Soft violet night theme.",
      "tags": ["dark", "violet"],
      "preview": "data:image/png;base64,…",
      "url": "https://example.com/themes/dusk.lenstheme",
      "sha256": "<hex of the .lenstheme file, for a future download check>",
      "theme": { "lenstheme": 1, "name": "Dusk", "theme": { "preset": "tokyo-night", "...": "..." } }
    }
  ]
}
```

A future website can host this file; when downloads are added, Lens should fetch `url` only
over https and refuse any file whose SHA-256 differs from `sha256`.
