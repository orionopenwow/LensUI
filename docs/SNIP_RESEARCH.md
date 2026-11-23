# Lens Snip — research

What the best screenshot tools do, and what Lens Snip takes from them. About 20 lookups (product
pages, docs, reviews) on 2026-11-22. Quotes are under 15 words, at most one per source; everything
else is paraphrased. Where a source could not confirm something, it says so.

## Sources and what each contributes

| Tool | What it does best (paraphrased) | Source |
|---|---|---|
| **ShareX** (Windows, free) | A chain of "after capture" tasks — beautify, editor, copy, pin, save, OCR, QR scan, upload — plus "after upload" tasks and per-hotkey workflows. Editor has step markers, spotlight, magnify, blur/pixelate. Scrolling, GIF and screen recording. | [getsharex.com](https://getsharex.com/) |
| **CleanShot X** (macOS) | A **Quick Access Overlay** in the corner after each capture for copy/save/annotate/drag-out; floating **pins** with opacity; scrolling capture; on-device OCR in 30+ languages; background presets; recording with click/keystroke overlays; one month of history. | [cleanshot.com/features](https://cleanshot.com/features) |
| **Windows Snipping Tool** | **Text Actions**: copy text from a snip, and **Quick Redact**, which hides emails and phone numbers automatically; recording. | [Pureinfotech](https://pureinfotech.com/hide-text-screenshots-snipping-tool-windows-11/) |
| **PowerToys Text Extractor** | Win+Shift+T, drag a region, the text lands on the clipboard. Uses the Windows OCR language packs (`Windows.Media.Ocr`). | [Microsoft Learn](https://learn.microsoft.com/en-us/windows/powertoys/text-extractor) |
| **Shottr** (macOS) | Pixel rulers, OCR and QR, colour picker on Tab, pins, scrolling capture, backdrop (gradient, shadow, corners), "smart erase" for sensitive text. | [shottr.cc](https://www.shottr.cc/) |
| **Snagit** | **Step Capture** (numbered how-to captures exported to Word/HTML/Markdown), **Smart Redact** of contact details, card and ID numbers and faces, a recent-captures tray with pinning. | [TechSmith what's new](https://www.techsmith.com/learn/tutorials/snagit/whats-new/) |
| **Flameshot** (Linux/Windows) | In-place annotation right on the selection: arrows, marker, pixelate, an auto-incrementing **counter bubble**; pin; system share picker; CLI. | [How-To Geek](https://www.howtogeek.com/devops/how-to-use-flameshot-a-linux-screenshot-tool/) |
| **Xnapper** | Beautify-first, plus automatic detection of emails, phone numbers, IP addresses and API keys for redaction. | [Xnapper blog](https://xnapper.com/blog/hide-text-in-screenshot) |
| **Arc Capture** | Hover snaps the selection to page elements; capture → copy, save, send via Messages or drop onto a whiteboard. | [AllThings.How](https://allthings.how/how-to-take-a-screenshot-in-arc-browser/) |

Platform facts:

- **`WDA_EXCLUDEFROMCAPTURE`** (Windows 10 2004+): a window with this affinity is shown on the
  monitor and nowhere else; on older builds it behaves like `WDA_MONITOR` (shown blank). Microsoft
  notes it is "not a security feature or DRM" ([SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)).
  Lens must respect it: protected windows (password managers, DRM video, some banking apps) come
  out black or missing, and Lens says so instead of trying to work around it.
- **Windows.Graphics.Capture**: the modern capture path, needs a D3D11 frame pool, and draws a
  yellow border around captured items; `CreateForWindow/Monitor` interop skips the picker
  ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture)).
  For single still frames, screen-DC `BitBlt` (with `CAPTUREBLT`) and `PrintWindow(PW_RENDERFULLCONTENT)`
  are simpler, synchronous and border-free; Lens v1 uses those and keeps WGC for recording later.
- **Share sheet from a desktop app**: `IDataTransferManagerInterop::GetForWindow` +
  `ShowShareUIForWindow` on our own HWND, then fill the `DataRequested` package
  ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-idatatransfermanagerinterop)).
  The user picks the target (Nearby Share, Phone Link, Mail, Discord, …); the app never sends.
- **OCR**: `Windows.Media.Ocr.OcrEngine.TryCreateFromUserProfileLanguages` → `RecognizeAsync(SoftwareBitmap)`
  → lines → words with bounding rects ([OcrEngine](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine)).
  Not verified from the docs whether it is fully offline; PowerToys uses the same installed language
  packs, and Lens treats it as local but says "uses Windows OCR language packs" rather than promising more.
- **Print Screen**: `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled` (DWORD, 1 = opens
  Snipping Tool) ([Winaero](https://winaero.com/how-to-disable-print-screen-from-opening-snipping-tool-in-windows-11-and-10)).
  Recent Windows 11 previews add a machine policy, "Make Print Screen key yieldable", that can stop
  third-party apps from taking the key ([WindowsForum summary](https://windowsforum.com/news/windows-11-preview-new-machine-level-print-screen-policy-for-third-party-apps.403972/),
  community source, not official). Lens therefore defaults to its own hotkey and treats Print Screen
  as optional and reversible.

## Ranked features

Score = how often the feature is the reason people pick a tool (from the pages above) × fit with
Lens (Shelf, AI, Command, themes). Effort: S < 1 day, M 1–3 days, L > 3 days.

| # | Feature | Best at it | Lens plan | Effort |
|---|---|---|---|---|
| 1 | Instant overlay after capture (copy / save / drag / annotate) | CleanShot Quick Access | **Pre-save studio** with a numbered actions bar | M |
| 2 | Annotate in place (arrow, box, text, highlight, counter steps, pixelate, spotlight) | Flameshot, ShareX, Snagit | Studio tools, undo/redo, keyboard shortcuts | M |
| 3 | OCR copy text | Snipping Tool, PowerToys, Shottr | Windows OCR, text layer, "Copy text" (key 2) | S |
| 4 | Auto-redact sensitive data | Snipping Tool Quick Redact, Snagit Smart Redact, Xnapper | Local detectors over OCR words: email, phone, API keys/tokens, card-like (Luhn), IPs, URLs with secrets; one-click accept | M |
| 5 | Pin to screen | CleanShot, Shottr, Flameshot, ShareX | Pin window: always on top, zoom, opacity, click-through | S |
| 6 | Beautify (padding, gradient, shadow, corners) | Xnapper, CleanShot, Shottr | Theme-aware presets | S |
| 7 | History | CleanShot, Snagit | Local library, OCR-searchable, DPAPI-sealed, retention | M |
| 8 | Share via system picker | Flameshot, Arc | Windows share sheet + "Recent" chips that never auto-send | M |
| 9 | Recording (MP4/GIF, click highlights) | CleanShot, ShareX, Snipping Tool | Region/window recording via ffmpeg (already used for transcription), click rings, border + timer, trim | L |
| 10 | Scrolling capture | CleanShot, ShareX, Shottr | Experimental: wheel messages to the chosen window + row-matching stitch | M |
| 11 | Element snapping while selecting | Arc | Snap to window and UI Automation element rects | S |
| 12 | Loupe, pixel coords, colour readout, ruler | Shottr, CleanShot | In the selection overlay and studio | S |
| 13 | Step capture docs | Snagit | Numbered step tool now; multi-snip step docs later | L |
| 14 | QR scan | ShareX, CleanShot, Shottr | Later (needs a decoder) | M |
| 15 | Cloud upload links | ShareX, CleanShot | **Not by default** — see "don't do" | — |

### Where Lens goes further (the user's direction)

- **More before save**: the studio is the default after-capture step, not an optional editor, and
  redaction suggestions are already drawn when it opens.
- **Paste to Claude**: one key puts the image on the clipboard and brings Claude Desktop forward so
  a single Ctrl+V attaches it, or opens Lens Command with the OCR text as a context chip and a privacy
  card listing exactly what would be sent. Local vision models (e.g. llava, qwen-vl in Ollama) are
  preferred when present.
- **Send to a recent friend**: chips for the share targets and apps you used last. They open the
  target with the image ready; you always press Send yourself.
- **Into the Shelf**: the snip and its OCR text become one Shelf item, usable as AI context.

## Quick wins (shipped in this PR)

1. Region / window / monitor / all-monitors / last-region / delayed capture, DPI-correct.
2. Selection overlay with loupe, coordinates, colour readout and window/element snapping.
3. Pre-save studio: arrow, box, highlight, text, numbered steps, pixelate/blur, spotlight, crop, pen.
4. Local OCR text layer + Copy text.
5. Auto-redact suggestions (accept one / accept all).
6. Beautify presets from the active theme.
7. Actions bar with number keys: Copy, Copy text, Save, Pin, Shelf, Paste to Claude, Ask, Translate, Share, Recent.
8. Pin windows with zoom, opacity and click-through.
9. Encrypted local history with OCR search and retention.
10. Optional Print Screen takeover with backup and exact restore.

## Long term

1. Windows.Graphics.Capture for recording (no ffmpeg dependency, HDR-aware) and per-window recording of occluded windows.
2. Media Foundation H.264 encoder in-process.
3. Step capture documents (Snagit-style) exported to Markdown/Docs.
4. QR / barcode reading.
5. Face detection for redaction (needs a local model).
6. Smart erase (content-aware fill) for removed areas.
7. Video annotations and smart zoom on clicks.
8. Webcam overlay for recordings.
9. Optional, user-configured upload destinations (own S3/R2) — never default.
10. Snip-to-ticket integrations via connectors (GitHub issue, Linear) with an approval card.

## Don't do

- **Silent uploads or link generation.** Nothing leaves the PC unless the user picks an action that
  says where it goes.
- **Auto-sharing or auto-sending.** "Recent" chips prepare the target; the user presses Send.
- **Bypassing protected content.** Windows with `WDA_EXCLUDEFROMCAPTURE` / `WDA_MONITOR` and DRM video
  come out black or missing. Lens tells the user ("Some windows protect themselves from capture")
  and never tries to defeat it.
- **Capturing in the background.** No timers, no "auto capture", no recall-style history of things
  the user didn't snip.
- **Redaction that only hides.** Blur/pixelate is burned into the exported pixels; the original
  unredacted image is not kept alongside in history unless the user saves it that way.
- **Hijacking Print Screen without asking.** Opt-in, backed up, restored exactly on disable or uninstall.
