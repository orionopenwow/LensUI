# Flows

Twelve end-to-end flows as they work on `main` (`5a4a5b2`), read from the code. Each lists the screens (window → component), the steps, the friction, and the fix. Friction is ranked **P1** (people fail or get hurt), **P2** (people get confused or slowed), **P3** (polish). No renders were made in this pass (no browser runner in this workspace). The visual parity harness (`bun run parity`, `tools/parity/build.mjs` + `shoot.mjs`) renders surfaces and runs in CI; attach its shots to the PR that fixes a flow.

## 1. First install and setup wizard

**Screens:** installer → `settings` window → `SetupWizard` (Welcome, Look, Dock, Windows, Done).
**Steps:** run installer → Lens starts, dock and top bar appear → Settings opens with the wizard → pick a theme pack (live preview, "Animated backdrop" pre-ticked) → pick one of four dock layouts → choose whether to hide the Windows taskbar and start with Windows → Done shows a summary and a self-test.

| Friction | Rank | Fix |
|---|---|---|
| The wizard never mentions AI, Command, voice, Snip or agents, which are now most of Lens; all are off by default and only discoverable by browsing Settings. | P1 | Add a sixth step "Your assistant": provider (Claude key / local / none), Command hotkey, push-to-talk on/off, with "Try it" running one safe Command phrase. |
| Dock and top bar appear before the wizard, so first paint is a half-configured desktop. | P2 | Show the wizard first, then reveal the shell with the chosen look (one glide). |
| Only four of the dock styles are offered, with no hint that more exist. | P3 | "More styles in Settings › Dock" link under the grid. |
| "Start with Windows" sits on the same step as hiding the taskbar; people who hide the taskbar but don't autostart get a bare desktop after reboot until they launch Lens. | P2 | If the taskbar is hidden, default "Start with Windows" on and explain why in one line. |

## 2. Pick a theme

**Screens:** `settings` → Appearance (`ThemeTab`) → pack gallery; or Command ("use the Claude theme"); or voice.
**Steps:** open Settings → Appearance → click a pack card → Lens recolours every window, cursors follow if "Follow theme pack" is on → optional accent, shape style, fonts, schedule.

| Friction | Rank | Fix |
|---|---|---|
| Theme switch runs over the frame budget (PERF_REPORT): every window re-renders at once and flashes. | P2 | Apply tokens as CSS variables on the root only; stagger window repaint by 1 frame; measure in the E2E fluidity suite. |
| ThemeTab has nine collapsible sections; the pack choice and the "Customise" controls compete. | P2 | Gallery first, "Customise" as a single drawer. #40 owns the styling. |
| No undo after switching packs except picking the old one again. | P3 | Toast "Theme changed · Undo" via `control_undo`. |

## 3. Change dock style

**Screens:** `settings` → Dock & Bar (`DockTab`) → style grid; or Command "dock style floating".
**Steps:** pick a style → dock window resizes and re-lays out → icon size follows the style.

| Friction | Rank | Fix |
|---|---|---|
| Fixed (B-15): the Dock window's depth and every style's hit-testing come from the measured pill rect; the native window is only resized while the Dock is idle. | Done | Check on real hardware: tall pills (96 px icons, magnification), side Docks, auto-hide. |
| Picking a style silently changes icon size. | P3 | Say it inline: "Floating uses 48 px icons. Change below." (text exists; move it next to the grid). |

## 4. Command "do it"

**Screens:** `command` window (`CommandSurface`) → plan card → approval (local card today) → presence bar.
**Steps:** Ctrl+Alt+Space → type "turn on night light and mute Spotify" → Command shows a plan with one row per action → Run → presence shows each step → result with Undo.

| Friction | Rank | Fix |
|---|---|---|
| First query after launch can be lost (cold-start replay race, B-12). | P1 | Ready handshake: Rust queues the opening query until the surface reports ready. |
| Approval happens in Command's own card, not the shared one; grants differ from voice and MCP. | P2 | Route through `approval` (`fromPendingAction`). |
| No safety check on URLs or content in plans (B-04). | P1 | `agentsafe` inside `control_preview`. |
| Command is off by default and the hotkey isn't shown anywhere until enabled. | P2 | Wizard step (flow 1) and a dock search hint "Ctrl+Alt+Space to ask". |

## 5. Voice command

**Screens:** `voicehud` → (optional) `conversation` → presence.
**Steps:** hold Right Ctrl → say "Lens, minimise this" → HUD shows the transcript → action runs → HUD shows result with Undo.

| Friction | Rank | Fix |
|---|---|---|
| One-click whisper setup fails closed because checksums are `UNPINNED` (B-07); people must install a whisper server by hand. | P1 | Pin checksums before release. |
| Holding Right Ctrl conflicts with apps that use it (games, remote desktop). | P3 | Already configurable; show the conflict hint in Settings when a fullscreen app is detected. |

## 6. Right-click → Shelf → context pack → Claude

**Screens:** right-click menu (magic or Lens menus) → `edgeshelf` / Shelf panel → pack → Command or Claude Desktop.
**Steps:** select text or a file → Ctrl+Alt+S (add selection) or right-click › Add to Shelf → Shelf shows the item → group items into a pack → "Ask Claude with this pack" → Command opens with context chips, or Claude Desktop receives it over MCP.

| Friction | Rank | Fix |
|---|---|---|
| Files can't be dragged out of the Shelf and Explorer selection isn't captured. | P2 | Build `IDataObject` drag-out and Explorer selection via the shell window (planned). |
| Magic menu isn't on Shelf items (B-11), so actions differ by surface. | P2 | One action registry for magic, Shelf and dock. |
| The micro-save toast exists but is unmounted (`MicroSaveToast.tsx`), so saves are silent. | P3 | Mount it. |

## 7. Snip → Claude

**Screens:** `snip` overlay → studio → "Paste to Claude".
**Steps:** shortcut (or Print Screen if enabled) → pick region/window → studio (hide suggestions, annotate) → Paste to Claude: Claude Desktop is brought forward with the image on the clipboard (the person presses Ctrl+V), or Command opens with the snip attached.

| Friction | Rank | Fix |
|---|---|---|
| OCR text can carry injected instructions straight into Command without any check (B-04). | P1 | Run `agentsafe_scan` on OCR text and mark it untrusted in the context chip. |
| Two different "send to Claude" behaviours depending on target, explained only in docs. | P3 | Label the button with the target: "Paste into Claude Desktop" / "Ask Lens Command". |

## 8. Lens Browser agent with approval

**Screens:** `browser` → agent panel → approval → presence over the page.
**Steps:** open Lens Browser → ask "find the cheapest flight and fill the form" → agent describes the page, proposes actions → login/payment flows ask → presence shows the ghost cursor → result.

| Friction | Rank | Fix |
|---|---|---|
| Browser uses its own `browser_agent_check`/`browser_untrusted`, not `agentsafe`; grants and quarantine from Settings don't apply. | P1 | Make the browser checks inputs to `agentsafe_check`. |
| Approval card is local to the browser. | P2 | Shared approval card. |
| Esc doesn't stop the run unless a Lens window has focus (B-13); the page usually has focus. | P1 | Low-level Esc check while a run is active; show "Esc or Ctrl+Alt+Pause to stop" in the presence bar. |

## 9. Install an app via Lens Apps

**Screens:** `apps` window → app page → install progress → integrations (recipes).
**Steps:** open Apps → search "VLC" → Install (winget, audited) → progress → optional "Make it match Lens" recipe preview → apply.

| Friction | Rank | Fix |
|---|---|---|
| Recipes are not reverted by Remove all (B-08). | P2 | Add the step. |
| winget elevation prompts appear behind the Apps window on some machines. | P2 | Bring the UAC-owning process forward / show "Waiting for Windows to ask permission" state. |
| Release-prepare card is another local approval UI. | P3 | Shared card. |

## 10. Settings: change sound output

**Screens:** `settings` → Sound page; or Quick Settings › audio; or Command "switch to headphones".
**Steps:** open Sound → pick an output device (headphones/speaker icon) → default device switches; Lens remembers the last two outputs for quick toggling.

| Friction | Rank | Fix |
|---|---|---|
| Three places do the same thing with different UIs (hub, Quick Settings, Command) and only the hub remembers last outputs. | P2 | One `control` setting (`sound.output`) used by all three; Quick Settings shows the two remembered outputs first. |
| Settings tab switch over frame budget. | P3 | Keep pages mounted after first visit; measure. |

## 11. Remove all Lens changes

**Screens:** `settings` → About › Back up & restore (`BackupRestoreCard`) → typed confirmation → step report.
**Steps:** open the card → Remove all → type the confirmation → optionally tick "Delete Lens data" → Lens reverts folders, Explorer icons, shell mode, Windows settings, startup, tray, taskbar, window styling, Windhawk mod, pointers, overlays, hooks, browser bridge, `lens://`, Explorer verbs, **Claude Desktop entry and Spicetify theme (added this pass)**, Print Screen → report lists each step.

| Friction | Rank | Fix |
|---|---|---|
| Items were missing until this pass (B-01, B-02); recipes still are (B-08). Nothing prevents the next feature from forgetting. | P1 | A change registry with a CI test (SCOPE §6.2). |
| The report is a flat list; failures aren't grouped or retryable. | P2 | Group "Done / Needs you / Not changed", with Retry per failed step. |
| Lens keeps running afterwards with defaults; people expect it to quit or uninstall. | P2 | End screen: "Uninstall Lens" (opens Apps & features) and "Quit Lens". |

## 12. Report a bug via Tester Hub

**Screens:** `testerhub` → checklist → log ring → export report.
**Steps:** open Tester Hub (tray) → work through the checklist → Ctrl+Alt+M marks a moment in the log → Export report (redacted) → attach to GitHub issue.

| Friction | Rank | Fix |
|---|---|---|
| Export produces a file; the person still has to open GitHub, create an issue and attach it. | P2 | "Open a prefilled issue" link (title, environment, checklist state) and reveal the report file next to it. |
| Redaction is invisible; testers don't trust it. | P3 | Show a diff preview of what was redacted before export. |

## Top friction across flows

1. Agent paths skip safety checks (flows 4, 7, 8) — B-04.
2. AI is invisible at first run (flow 1).
3. Approval UI differs by surface (flows 4, 8, 9).
4. Stopping an agent with Esc doesn't work outside Lens windows (flow 8) — B-13.
5. Command's first query can be lost (flow 4) — B-12.
6. Dock window sizing leaves dead click areas (flow 3) — B-15.
7. One-click transcription setup can't succeed (flow 5) — B-07.
8. Remove all has no guard against future gaps (flow 11).
9. Same setting, three UIs (flow 10).
10. Theme switch jank (flow 2).
