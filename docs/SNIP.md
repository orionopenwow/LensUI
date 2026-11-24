# Lens Snip

Capture anything on screen, then do more with it **before** it's saved: mark it up, hide private
details (suggested by local OCR), copy its text, translate it in place, frame it — and with one key
copy, save, pin, put it on the Shelf, paste it to Claude, ask about it, share it, or hand it to an
app. Research and the feature ranking are in [SNIP_RESEARCH.md](SNIP_RESEARCH.md).

Everything is **off until you turn it on** (Settings › Lens Snip), local, and reversible.

## What's in it

| Area | What it does |
|---|---|
| Capture | Region (with snapping to windows and UI Automation element edges), window (rendered on its own with `PrintWindow`, even when covered), screen, all screens, last region, freeform lasso, 3/5/10 s delay, optional pointer. Frozen-screen overlay with a loupe (8×, pixel grid, coordinates, hex colour), size label with the monitor's scale, arrow-key nudge (Alt+arrows resize), Tab to switch modes. |
| Studio (before save) | Arrow, box, highlight, text, numbered steps (renumber on delete), pixelate, blur, spotlight, pen, crop; 7 colours, 4 widths; undo/redo (100 steps); select + Delete. |
| Hide sensitive details | Windows OCR on this PC → suggestions for emails, phone numbers, card numbers (Luhn), API keys/tokens (known prefixes, `key=value`, `Bearer x`, high-entropy strings), IPv4/IPv6, links with secrets. Each one ticks on/off; **Hide all** takes the likely ones. Hidden areas are burned into the exported pixels, and the words under them become `•••` in every text Lens copies or sends. |
| Text | OCR text panel, **Copy text** (2), translate in place (8) through Lens Intelligence — local model by default; cloud only through the AI privacy setting, with a "Needs your OK" card. |
| Frame | Off · Soft · Vivid · Mono · Theme (gradient from the active theme), padding, rounded corners, shadow. |
| Actions bar | `1` Copy · `2` Copy text · `3` Save · `4` Pin · `5` Shelf · `6` Paste to Claude · `7` Ask · `8` Translate · `9` Share · `0` Send to…, plus Ctrl+C / Ctrl+Shift+C / Ctrl+S, arrows + Enter, Esc. **Recent** chips for the targets you used last. A drag handle drops the PNG into any app. |
| Paste to Claude | **Claude Desktop**: image on the clipboard, Claude brought forward — you press Ctrl+V; Lens sends nothing. **Lens Command**: opens Command with the snip attached (image path + OCR text); Command's AI privacy rules decide where it's answered. |
| Share / Send to… | Windows share sheet (Nearby Share, Phone Link, Mail, any share target) over the Lens window; "Send to…" copies the image and brings an app forward (or starts it). **Lens never sends a message** — you press Send. |
| Pins | Always-on-top windows: drag to move, Ctrl+wheel zoom, Ctrl+0 reset, opacity, click-through (turn off from the card: "Make pins clickable"), copy, Esc / double-click to close. Up to 12. |
| Recording | Region recording through ffmpeg `gdigrab` (the ffmpeg Lens already uses for transcription) to MP4 or GIF; mic off by default; border and control bar excluded from capture (`WDA_EXCLUDEFROMCAPTURE`) so they never appear in the video; the hotkey stops; trim after stopping (stream copy, new file). |
| Scrolling capture | Experimental: wheel messages posted only to the chosen window (pointer never moves), frames stitched by row matching that ignores sticky headers/footers and the scrollbar; stops at the end, 40 steps or 20 000 px. |
| History | Local library of every snip you copy, save, pin, share or send: OCR-searchable, `#tags`, keep (pin) to protect from retention, reopen in the studio. Index and images sealed with DPAPI under `%APPDATA%\LensUI\snip\history`. Never synced. Retention by days, count and size. |
| Print Screen | Optional. Sets `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled` to 0 and registers Print Screen; the original value — including "didn't exist" — is backed up once and restored exactly when you turn it off, turn Snip off, or close Lens. A machine policy can still keep the key; Lens says so and your own shortcut keeps working. |

## What Lens Snip won't do

- Upload anything, make links, or send messages on its own.
- Capture in the background or on a timer you didn't start.
- Work around windows that protect themselves from capture (`SetWindowDisplayAffinity`) — they come out black or missing, as Windows intends.
- Keep an unredacted copy of a snip you redacted (history stores what you exported).

## Files

| Path | What |
|---|---|
| `src-tauri/src/snip/geom.rs` | Region maths in physical virtual-desktop pixels, mixed-DPI safe (property tests). |
| `src-tauri/src/snip/redact.rs` | Auto-redact detectors (table tests incl. false-positive guards). |
| `src-tauri/src/snip/stitch.rs` | Scrolling-capture stitching (synthetic page tests). |
| `src-tauri/src/snip/template.rs` | File names, Windows-safe, never overwriting. |
| `src-tauri/src/snip/{config,recent,printscreen,record,history,image,service}.rs` | Settings, Recent targets, Print Screen plan, ffmpeg args, library, PNG/DIB, state + storage. |
| `src-tauri/src/snip/{win,ocr,share}.rs` | Windows: capture, windows, UI Automation, clipboard, registry; Windows OCR; share sheet. |
| `src-tauri/src/commands/snip.rs` | 32 commands, hotkeys, recording, pins, scrolling capture. |
| `src/snip/*` | Overlay (`Select`), `Studio`, `Pin`, `Record`, `HistoryView`, pure models (`geom`, `annotations`, `actions`), `render` (burn-in), `api`. |
| `src/components/SnipCard.tsx` | Settings card. |
| `tools/parity/snip/*` | Screenshot gallery (11 scenes × 2 themes) — runs in CI. |

## Shared-file edits made in this PR (kept minimal)

| File | Change | Why |
|---|---|---|
| `src-tauri/Cargo.toml` | `windows` features: `ApplicationModel_DataTransfer`, `Globalization`, `Graphics_Imaging`, `Media_Ocr`, `Storage`, `Win32_Storage_Xps`, `Win32_System_DataExchange`, `Win32_System_SystemInformation` | Share sheet, OCR, PrintWindow, clipboard, local time. No new crates. |
| `src-tauri/src/lib.rs` | `mod snip;` + 32 `commands::snip::*` entries | Registration. |
| `src-tauri/src/commands/mod.rs` | `pub(crate) mod snip;` | Registration. |
| `src-tauri/src/app/integration.rs` | `commands::snip::init(&handle)` in `setup`; `commands::snip::shutdown()` in `shutdown` | Hotkey at startup; Print Screen handed back and recording stopped on exit. |
| `src-tauri/capabilities/default.json` | windows `"snip"`, `"snip-*"` | The overlay, pins and recording frame call commands. |
| `src/main.tsx` | `snip` surface | Route for the Snip windows. |
| `src/types/generated.ts` | regenerated | IPC types. |
| `.github/workflows/build.yml` | "Render Lens Snip scenes" step + artifact path | Gallery in CI. |
| `.gitignore` | `tools/parity/snip/{out,shots}/` | Build output. |

## Snippets for other packages (not applied here)

1. **Control Center** — `src/surfaces/ControlCenterSurface.tsx`, Theme & Look… or a "Capture" section next to `<ClipboardCard />`:
   ```tsx
   import { SnipCard } from "../components/SnipCard";
   // …
   <SnipCard />
   ```
2. **Dock** — a Snip button in the Dock menu / system area and a right-click menu on it:
   ```ts
   import { snipStart } from "../snip/api";
   // click: snipStart()            right-click items: snipStart("window"), snipStart("all"), snipStart("last")
   // "Record a region…": snipStart("record")   "Snip history": open Control Center › Lens Snip
   ```
3. **Lens Command** — `/snip` built-in (in `src/command/parse.ts` builtins) running `snipStart()`; and render the
   `attach` field that `snip_to_claude` sends with `lens://command/open`, in the open listener of
   `CommandSurface.tsx`:
   ```ts
   const a = (e.payload as any)?.attach;
   if (a?.kind === "snip") {
     addChip({ ...textChip("file", a.title, a.ocrText ?? ""), detail: `${a.width}×${a.height} snip`, key: `snip-${a.path}` });
     // When ai-core gains image inputs, pass `a.path` as an image attachment; until then the OCR text goes as context.
   }
   ```
4. **Voice** (feature/voice, `ai/intent.rs`): intents `snip_region`, `snip_window` ("Lens, snip this window" → `snip_start("window")` then commit the foreground window), `snip_screen`, `snip_record`, `snip_stop` (→ `snip_record_stop`). Risk: low (they only open the overlay).
5. **Right-click catalogue** (feature/rightclick-context, `src/context/actions.ts`): `{ id: "snip-window", label: "Snip this window", contexts: ["window", "app"], run: () => snipStart("window") }`, `{ id: "snip-region", label: "Snip a region", contexts: ["desktop"] }`, `{ id: "record-region", label: "Record a region", contexts: ["desktop"] }`. Explorer verb on images: "Open in Lens Snip studio" → a small `snip_open_file(path)` command (decode PNG/JPEG → `put_snip` → `open_studio`), not built here.
6. **Lens Mini** tile: `{ id: "snip", label: "Snip", icon: "Camera", run: () => snipStart() }`.
7. **Guide** anchors (`data-guide-id`): `snip-card` (on the card), plus lesson "Snip anything" steps: press the shortcut → pick Window → hide a suggestion → press `4` to pin. Completion check: `snip_history().length > 0`.
8. **Claude control** (feature/claude-control): register `snip_start` (low), `snip_record_start` (confirm), `snip_history` (read). Never expose `snip_open_in` / `snip_share` to agents — they hand content to other apps.
9. **Backup / uninstall** — `win_uninstall.rs` "Remove all Lens changes": call `crate::commands::snip::shutdown()` (restores Print Screen). `win_backup.rs`: include `%APPDATA%\LensUI\snip\settings.json` (not `history/`, which is DPAPI-sealed to this user and PC).
10. **Approval card** (feature/claude-control `src/approval/*`): the studio's "Paste to Claude" and "Translate" cards follow the same pattern; swap `PopoverCard` for the shared component when it lands.

## Needs real hardware

- Capture on mixed-DPI multi-monitor setups (overlay spans monitors with different scale; Lens re-applies the window rect after Windows' DPI change), negative coordinates, HDR displays (BitBlt returns SDR).
- `PrintWindow(PW_RENDERFULLCONTENT)` on Chromium, UWP and DirectX apps; fallback to on-screen pixels.
- UI Automation element snapping latency (150 ms budget) on heavy apps.
- Windows OCR language packs and accuracy on small text; auto-redact false positives in real screenshots.
- Clipboard image paste into Office, Discord, Slack, Claude Desktop (CF_DIB + PNG).
- Share sheet from the overlay window (desktop-app `IDataTransferManagerInterop`), targets that only accept files.
- Print Screen takeover with and without the "Make Print Screen key yieldable" policy.
- ffmpeg `gdigrab` recording at 60 fps, mic devices, `WDA_EXCLUDEFROMCAPTURE` keeping the border out of the video (Windows 10 2004+).
- Scrolling capture in browsers, Office and chat apps (smooth scrolling, lazy-loaded content).
- Pin click-through and dragging; WebView2 drag-out of the PNG (`DownloadURL`) into Explorer/Discord.
