# Lens voice control

"Lens, minimise this." Voice is **off by default** and local only: speech is recognised on the PC by whisper.cpp, audio is never written to disk or sent anywhere, and Lens has no cloud speech option. Research and the architecture choice are in [VOICE_RESEARCH.md](VOICE_RESEARCH.md).

## How it works

| Piece | Where | Tested |
|---|---|---|
| State machine: push-to-talk hold/toggle, wake phrase, debounce, barge-in, confirm timeout, mute/pause, typed commands | `src-tauri/src/voice/state.rs` | 10 tests |
| Grammar: wake phrase, filler/hallucination cleanup, aliases, voice-only commands, spoken numbers, fuzzy app names, ask fallback, did-you-mean | `voice/grammar.rs`, `numbers.rs`, `fuzzy.rs`, `catalog.rs` | 158-phrase table; 13 tests across the four files |
| Safety: never types into password fields, elevated or credential windows, or Lens itself; always-listening auto-pause | `voice/safety.rs` | 3 tests |
| Undo: inverse of window actions, volume, mute, brightness, DND, theme, accent, dock style and workspace | `voice/undo.rs` | 1 test |
| Move window to next/previous monitor | `voice/geometry.rs` | 3 tests |
| Audio: level meter, energy VAD with calibration, WAV encoding, pre-roll ring | `voice/audio.rs` | 5 tests |
| Mic capture (WASAPI shared, Windows converts to 16 kHz mono) | `voice/capture.rs` | CI compile |
| whisper-server process, multipart request, response parsing | `voice/whisper.rs` | 3 tests |
| Windows glue: window actions, monitor move, lock, UIA focus/IsPassword (150 ms worker), token elevation, SendInput Unicode typing, Ctrl+V, mic-in-use (CapabilityAccessManager), mics/TTS via PowerShell | `voice/winops.rs` | 1 test plus CI compile |
| Runtime: hotkeys, capture lifecycle, watchdog, live words, executing commands, undo stack | `voice/mod.rs` | (pure parts above) |
| Settings (`%APPDATA%\LensUI\voice.json`) | `voice/config.rs` | 3 tests |
| Commands | `commands/voice.rs` | generated types |
| HUD, mic indicator, mic button, earcons, conversation view | `src/voice/*` | `src/__tests__/voice.test.ts` (20 tests) |
| Settings card | `src/components/VoiceCard.tsx` | parity gallery |

### Shared grammar and gating with AI
New intents in `ai/intent.rs` are used by voice, the palette's "Do it" and `ai_run_intent` alike: `window_action`, `move_window`, `open_overview`, `set_accent`, `set_dock_style`, `next_wallpaper`, `set_wallpaper_scene`, `set_calm_mode`, `lock_screen`. They are registered in `ai/tools.rs` with these risks:

- **low:** `window_action`, `move_window`, `open_overview`, `set_dock_style`, `next_wallpaper`, `set_wallpaper_scene`, `set_calm_mode`
- **confirm:** `lock_screen`

`close_app` and `create_note` stay **confirm**. Dictation and paste are **voice-only**. They are not AI tools, because the registry still blocks `type_text` and `press_keys` for AI, and every use goes through `safety::dictation_allowed`.

## The Dock is the voice UI

When voice is active, the **Dock itself becomes the voice capture module**. The floating HUD is only the fallback when no Dock shows it (auto-hidden Dock, Dock off). The Dock reports itself with `voice_set_dock_ui(true)`, and the state event's `dock_ui` hides the HUD.

- **Morph** (`src/dock/voice/VoiceDock.tsx`, `dockMorph.ts`):
  - **Triggers:** pressing the hold key, tapping the Dock mic, or hearing "Lens…" in the partials (wake mode).
  - **Width:** the pill keeps its exact width (the same rule as search). App icons compress to a strip at the end (fewer and smaller when narrow).
  - **Freed space:** an accent waveform plus a **live transcript**. Bright words are confirmed (seen in two partials in a row); monospace words are still changing. The newest words stay visible.
  - **Recognised:** a chip ("Minimise · Google Chrome") with a 1.5 s **Undo** key chip (a countdown underline), then the Dock morphs back.
  - **Confirm-risk:** an approval card above the Dock (below for a top Dock, beside for side Docks). Yes/No can be clicked or spoken.
  - **Errors:** a short red chip.
  - **All six styles and every edge:** `voiceDockLayout(style, edge, w, h, apps)` fits the voice UI inside the pill; tests check the width lock for all six styles on all four edges. Vertical Docks show a vertical waveform and put the transcript in a flyout.
  - **Reduced motion:** crossfade only.
  - **Wake mode:** speech that never says "Lens" never morphs the Dock (`armed` is false until the wake word appears in a partial).
- **Hold-to-talk:**
  - **Default key: hold Right Ctrl.** A keyboard hook watches only that key, Esc while listening, and "another key went down", so Right Ctrl+C never opens the mic. It never swallows a key, ignores injected keys, and is installed only while voice is on.
  - Listening starts after 180 ms of holding. Release sends, Esc or a chord cancels, and a double-tap latches hands-free until the next tap.
  - Right Alt or any modifier shortcut can be chosen instead. Ctrl+Win was not used because Win-key combinations belong to Windows and Lens's launcher (#2).
  - The **Dock mic button** (`DockMicButton`, at the end of every style): hold to talk, release to send, slide off (more than 24 px) or Esc to cancel, double-tap to latch. It fills while held.
- **Very quick actions** (`voice/early.rs`):
  - While you talk, Lens re-recognises the utterance so far every ~350 ms (at most the last 6 s, only when whisper is free) and runs the grammar on every partial.
  - When speech stops for **280 ms** (energy VAD) and the latest partial already covers everything said, it fires **without waiting for a final pass**, provided:
    - it is **low-risk** (every step for chains);
    - confidence is at least 0.85;
    - it is **complete** (the same meaning in two partials in a row, or confidence of at least 0.95);
    - the wake word was heard.
  - Confirm-risk, dictation, questions and yes/no never fire early.
  - On key release, a partial that already covers everything said is used instead of a final pass.
  - Results report `latency_ms` (end of speech → action done) and `early`.
- **"Lens…" structure:**
  - Wake mode always needs "Lens" / "Hey Lens" first. Anything else is dropped silently, as soon as three words go by without it.
  - Push-to-talk can require it too: Settings › Voice › Require "Lens" first.
  - **Chaining:** "Lens, dark mode and mute" or "snap left then open Spotify" runs two to four intents in order with **one undo**. Every part must parse; otherwise the phrase is read as one command. A chain asks first if any step is confirm-risk.
- **Mount snippet** (`DockSurface.tsx`, not edited here):
  ```tsx
  import { VoiceDockView, DockMicButton, useVoiceDock } from "../dock/voice/VoiceDock";
  const vd = useVoiceDock(dockVisible);            // tells Lens the Dock shows voice; listens to voice events
  // inside the pill (position: relative), after the icons:
  <VoiceDockView style={dockStyle} edge={config.dock.position} width={lockedDockWidth} height={pillHeight}
    morph={vd.morph} levels={vd.levels} icons={pinnedApps.map(renderSmallIcon)}
    reducedMotion={reducedMotion} onUndo={vd.undo} onAnswer={vd.answer} />
  // while vd.morph.stage !== "idle": fade the normal icons out (opacity 0 + scale .6, 160 ms; opacity only when reduced motion)
  // at the end of the pill, every style:
  <DockMicButton size={Math.min(40, pillHeight - 16)} live={vd.live} />
  ```
  - **Room above the pill:** the approval card sits above it, so give the Dock window room there while `vd.morph.stage === "confirm"` (the same way the search drawer does) and include it in the click-through region (the `lib.rs` click-through patch in DOCK_STYLES.md).
  - **Split style:** mount the voice UI in the app pill; the system pill stays as it is.
- **Bench:** `voice::bench::partial_to_action` (ignored; Windows plus whisper.cpp) streams each fixture in 350 ms steps and prints early-fire p50/p95 after end of speech next to the final-pass path (700 ms silence plus one pass). It asserts early p95 < 700 ms. **Not run on hardware yet.** On this sandbox, deciding on a partial (grammar plus rules) takes well under 1 ms (`early::tests::deciding_is_cheap` asserts < 5 ms).

## Conversation mode

An optional large panel or full-screen view for spoken Q&A (Settings › Voice › Conversation view: Off / Panel / Full screen; default Panel).

- **Opening it:** say "let's talk" / "conversation mode", or ask a question by voice while the view isn't Off.
- **Closing it:** say "that's all" / "end the conversation", press **Esc**, or click ✕.
- **Layout:**
  - top: "Lens is speaking · 1:01" with a coloured status dot;
  - the question in muted text;
  - the answer in large type, revealed word by word in sync with speech (spoken words bright, upcoming dimmed);
  - a monospace source line ("Reading …", the tool step, or "Answered on this PC · model");
  - bottom: an audio-reactive aurora in theme-accent colours with mute mic / stop / close.
- **Speech:**
  - `voice_say` speaks through Windows' voices and reports each word (`SpeakProgress`, read from a small PowerShell host via stdin/stdout, with nothing interpolated). `lens://voice/speech { id, word, done, interrupted }` drives the reveal.
  - If no word progress arrives within 1.5 s (speech unavailable), the view reveals by an estimate of about 170 wpm.
- **Follow-ups and barge-in:**
  - While the conversation is open, the mic listens without the key or wake phrase (state machine `Converse`), so follow-ups just work. Mute or close stops it.
  - Speaking over Lens stops the answer and starts listening. While Lens speaks, the VAD needs speech 8 dB louder, so Lens's own voice doesn't trigger it.
- **Reduced motion:** the aurora is a still band and the whole answer shows at once (no word animation).
- **Commands:** `voice_converse(on)`, `voice_say(text) -> id`, `voice_stop_speaking()`. The state event gains `conversation`, `conversation_view` and `speaking`; `lens://voice/apply` gains `conversation { open }`, and `ask` gets `{ conversation: true }`.
- **Window snippet:** add a `conversation` window (`index.html?surface=conversation`, transparent, decorations off, always on top, skipTaskbar, hidden). For "panel" size it 480×800 centred on the Lens monitor; for "fullscreen" size it to the monitor. Show it when the state event says `conversation: true`; the surface hides itself on close. Add it to `capabilities/default.json`.
- **Not verified:** that `SpeakProgress` events reach PowerShell's event queue promptly on every Windows build (it's the documented pattern; the estimate covers the gap), and echo levels on laptop speakers (barge-in margin).

## Contract

Commands (camelCase arguments on the JS side):

| Command | Args | Returns |
|---|---|---|
| `voice_status` | — | `VoiceStatus { config, phase, muted, paused_reason, engine_ready, engine_error, hotkey_error, mic_error }` |
| `voice_set_config` | `config: VoiceConfig` | `VoiceStatus` (saves, re-registers hotkeys, warms the engine) |
| `voice_ptt` | `down: bool` | Mic button press/release |
| `voice_set_dock_ui` | `active: bool` | The Dock shows the voice UI (HUD steps aside) |
| `voice_mute` | `muted: bool` | |
| `voice_cancel` | — | |
| `voice_answer` | `yes: bool` | Yes/No on a confirmation |
| `voice_undo` | — | `string` (what was undone) |
| `voice_run_text` | `text` | Typed command through the same grammar and gating; works even with voice off |
| `voice_commands` | — | Catalog `[{ id, group, title, examples, risk }]` |
| `voice_test_mic` | `on: bool` | Opens the mic for 8 s and emits levels |
| `voice_list_mics` | — | `[{ id, name }]` |
| `voice_list_tts_voices` | — | `string[]` |
| `voice_speak` | `text` | Reads aloud with a Windows voice |

Events:

| Event | Payload |
|---|---|
| `lens://voice/state` | `{ phase, enabled, muted, listening, by_ptt, activation, paused_reason, hud_position, sounds }` |
| `lens://voice/level` | `{ level }` (0..1, at most 20 per second, only while capturing an utterance or testing) |
| `lens://voice/heard` | `{ text, partial, ms? }` |
| `lens://voice/result` | `{ status: done/failed/confirm/suggest/refused/info/hint, heard, command, label, message, confidence, undo, suggestion }` |
| `lens://voice/apply` | `{ action: help/shelf_open/shelf_add_selection/shelf_clear/summarize/ask/read_back, args }` |

UI-layer registry tools also emit the existing `lens://ai/apply`: `open_overview`, `set_dock_style`, `next_wallpaper`, `set_wallpaper_scene` and `set_calm_mode` were added to `AiApplyTool`.

## Voice commands

Say "Lens, …" (wake mode) or hold the key (push-to-talk). Fillers ("um", "please", "can you"), recogniser punctuation and spoken numbers are fine.

- **Windows:**
  - minimise / maximise / restore this or *app*
  - pin this on top, unpin
  - close this window, close *app* (asks first)
  - snap left/right/top-left…, centre this
  - move this to the next / other / main monitor
  - move this window to workspace N
  - arrange windows, grid layout, side by side
  - show desktop, minimise everything
- **Apps:** open / launch *app*, switch to / go to / bring up *app*, find *file*, where is *file*.
- **Desktop:**
  - workspace N, next / previous workspace
  - overview, show all windows, task view
  - next wallpaper, show the aurora scene, falling sand
  - calm mode on/off, freeze the wallpaper
- **Look:**
  - dark / light mode
  - theme *pack* (all 18 packs)
  - accent *colour* (26 named colours or #hex)
  - make the dock slim / taskbar / studio / minimal / split / floating
- **System:**
  - volume N percent, louder, turn it down, mute, unmute
  - brightness N, dim the screen
  - do not disturb (for N minutes), focus mode, night light
  - timer for N minutes, pomodoro
  - open *page* settings
  - lock the screen (asks first)
  - take a note … (asks first)
  - what's 12 times 7, 5 km in miles
- **Shelf and clipboard:**
  - add this to the shelf, open the shelf
  - clear the shelf (asks first)
  - paste the last clip (guarded)
  - type … (guarded)
- **Ask and Command:** summarise this page / the selection, ask …, any question ("why is…", "how do I…"), read that back.
- **Voice:** help, what can I say, undo, yes / no / cancel, stop listening, mute the mic.
- **Your own phrases:** "lights out" → "dark mode" (Settings › Voice › Your phrases).

## Latency

- **Interpretation:** 0.067 ms per phrase with 302 installed-app names to fuzzy-match (optimised build on this sandbox; the `interpretation_is_fast` test asserts under 5 ms per phrase in debug builds). The script-intent path adds effectively nothing to recognition time.
- **End of speech to action:** depends on whisper.cpp. `voice::bench::end_of_speech_to_action` is an ignored test that:
  - starts whisper-server;
  - recognises and interprets every fixture WAV;
  - prints p50/p95/max and misrecognitions;
  - asserts p95 < 400 ms.

  Generate fixtures with Windows' voices (`scripts/voice/make-fixtures.ps1`), then run:

  ```
  set LENS_WHISPER_SERVER=C:\Tools\whisper.cpp\whisper-server.exe
  set LENS_WHISPER_MODEL=C:\Tools\whisper.cpp\models\ggml-base.en.bin
  set LENS_VOICE_FIXTURES=%TEMP%\lens-voice-fixtures
  cd src-tauri && cargo test --lib voice::bench -- --ignored --nocapture
  ```
- **Not measured yet:** there's no Windows audio or whisper.cpp in CI or this sandbox. Expect `ggml-tiny.en` or `ggml-base.en` to fit the 400 ms budget on a mid-range 8-thread CPU for 1–3 s commands. If base.en misses it, use tiny.en, or `q5` quantised models.

## Robustness rules (all tested in `state.rs`, `grammar.rs`, `safety.rs`)

- **Short presses and key bounce:** a press under 220 ms is a slip (with a "hold the key" hint). A second press within 120 ms of a release is bounce. Key auto-repeat is ignored.
- **Double triggers:** the same transcript within 1.5 s is dropped.
- **Barge-in:** speech heard while Lens is thinking is ignored (TV, its own voice). A push-to-talk press always takes over.
- **Limits:**
  - utterances: 15 s push-to-talk, 6 s wake
  - thinking: 10 s
  - unanswered confirmations: denied after 8 s
- **Low confidence:** below 0.6 confidence (recogniser times grammar), Lens asks "Did you mean …?", and yes runs it.
- **Silence and noise:** Whisper's silence hallucinations ("Thank you.", "[BLANK_AUDIO]") never become commands.
- **Watchdog:** a mic that stops delivering frames for 2 s is restarted, up to 3 times. After an error, Lens waits 5 s before retrying (no tight retry loop).
- **Threads:** mic, recognition and commands each run on their own threads. UI Automation has a 150 ms limit. No lock is held across recognition or command execution.

## Wiring left for the integrator

**Edits already made** (minimal, needed to compile and start):
- `src-tauri/src/lib.rs`:
  - `mod voice;`
  - `voice::init(app.handle())` at the top of `.setup`, which registers the voice hotkeys only when voice is enabled
  - `voice::shutdown()` in the panic hook and on `RunEvent::Exit`, which stops the mic and kills whisper-server
  - 13 `commands::voice::*` registrations
- `src-tauri/src/commands/mod.rs`: `pub(crate) mod voice;`
- `src/main.tsx`: the `voicehud` route.
- `src/types/generated.ts`: regenerated.
- `src/ai/contract.ts`: the new tools in `AI_TOOLS` and `AiApplyTool`.
- `src-tauri/src/ai/intent.rs` and `ai/tools.rs`: additive (new intents, tools, tests). Also fixed "do not disturb for N minutes", which used to return nothing.

**Snippets to apply:**

1. **HUD window** (`tauri.conf.json` › `app.windows`, or build it lazily like the other surfaces):
   ```json
   { "label": "voicehud", "url": "index.html?surface=voicehud", "transparent": true, "decorations": false,
     "alwaysOnTop": true, "skipTaskbar": true, "focus": false, "resizable": false, "visible": false,
     "shadow": false, "width": 480, "height": 560 }
   ```
   Add `"voicehud"` to `capabilities/default.json` › `windows`. Position it centred above the Dock (or under the Top Bar when `hud_position == "top"`) on the Lens monitor, using `win_monitors::dock_rect` / `topbar_rect`. Show and hide it from `voice::emit_state`: visible unless `phase` is `off` or `idle` and no result is pending. Simplest: in `app/setup.rs`, listen to `lens://voice/state` and `lens://voice/result` and call the same show/hide helper the other surfaces use. Keep it click-through-free (it has buttons) but never focus-stealing (`focus: false`, `WS_EX_NOACTIVATE` as for the Dock).
2. **Mic indicator** (`TopBarSurface.tsx`, system icons; or `DockSystemArea` for taskbar styles):
   ```tsx
   import { MicIndicator } from "../voice/VoiceHud";
   import { useVoiceHud } from "../voice/useVoiceHud";
   const voice = useVoiceHud();
   <MicIndicator state={voice.state} onClick={() => invoke("open_settings_page_cmd", { page: "voice" }).catch(() => {})} />
   ```
   It renders nothing while voice is off. The red dot means the mic is open, matching Windows' own indicator.
3. **Dock mic button** (`DockSurface.tsx`, optional, next to the sparkle) and **Lens Mini mic** (`src/command/mini/*`):
   ```tsx
   import { MicButton } from "../voice/VoiceHud";
   import { voicePtt } from "../voice/contract";
   <MicButton size={32} live={voice.state.listening} onPress={() => voicePtt(true)} onRelease={() => voicePtt(false)} />
   ```
4. **Settings:** mount `<VoiceCard />` (from `src/components/VoiceCard.tsx`) in the **AI & Command** tab, above `AiCard`. Add the `voice` settings page id to `SETTINGS_PAGES` in `ai/intent.rs` if you want "open voice settings".
5. **`lens://voice/apply`** handlers (Lens Command / Shelf owner):
   - `help`: the HUD already opens its help sheet; nothing needed.
   - `shelf_open` → open the Shelf drawer.
   - `shelf_add_selection` → `selection_to_shelf` (feature/shelf-command).
   - `shelf_clear` → `shelf_clear(active shelf)`. Voice has already confirmed.
   - `summarize {target}` → open Lens Command with `/summarise` and the page (browser bridge) or selection context.
   - `ask {text}` → open Lens Command in Ask mode with the text. AI privacy rules apply as usual.
   - `read_back` → `voiceSpeak(lastAnswerText)`.
6. **`lens://ai/apply`** handlers for the new UI-layer tools (where the existing apply bridge lives):
   - `open_overview` → `show_overview_cmd`
   - `set_dock_style {style}` → `updateConfig({ dock: { ...dock, style } })`
   - `next_wallpaper` → the wallpaper rotation's next
   - `set_wallpaper_scene {scene}` → Playground `playground.scene = scene`
   - `set_calm_mode {enabled?}` → Playground calm toggle
7. **Backup / remove-all-changes:** add `voice.json` to `win_backup`'s file list. Voice changes nothing in Windows, so there is nothing to restore.
8. **CI (optional):** add the voice gallery to the parity job:
   `node tools/parity/voice/build.mjs && node tools/parity/voice/shoot.mjs` (fails on any page or console error).

## Needs real hardware

- WASAPI capture with AUTOCONVERTPCM on real mics, including USB, Bluetooth headsets (16 kHz HFP), and device unplug/replug (watchdog).
- The `GetDevice(id)` round trip with ids from `voice_list_mics` (PnP `SWD\MMDEVAPI\{0.0.1…}` → MMDevice id).
- whisper-server start-up time, warm latency, and the bench p95 on a mid-range CPU (tiny.en / base.en).
- Global shortcut press/release for hold-to-talk while other apps have focus, and conflicts with other apps' hotkeys.
- UIA `IsPassword` in Chrome/Edge (accessibility tree on demand), Electron apps, Office and UWP. The 150 ms limit holds on busy apps.
- SendInput Unicode typing into common apps, and refusal for elevated windows (UIPI).
- Mic-in-use detection via the CapabilityAccessManager consent store during Teams/Zoom/Discord calls.
- Wake mode false accepts over an hour of normal room audio, and CPU use (one Whisper run per speech segment).
- PowerShell TTS and voice listing on Windows 10 and 11, and read-aloud not being captured as speech (barge-in guard).
