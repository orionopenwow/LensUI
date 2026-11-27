# Feature dossiers

One file per main feature, written for the Fable pass. Each has a rundown, a feature tree (features → sub-features → minute features, each with status and evidence), quick wins, a polish assessment, a bug assessment, one idea to push to main, a test plan, a suggested overhaul and a compact **Fable pass brief** to execute from.

Status words: **works** (built and tested), **partly** (built with gaps), **broken**, **not built**.

| Feature | File | Status | Top quick win | Top bug | Idea to push |
|---|---|---|---|---|---|
| Dock | [dock.md](dock.md) | works (Fable pass `fable/dock-20261126`: split, B-106–B-110, Dock keys, notice; quick wins `feat/dock-quick-wins`: titles list past 4 windows, scroll for volume, Ctrl+Alt+D focuses the Dock, B-150–B-152) | Pinned folders on the Dock (the Dock's own `:active` rules are gone and it runs the shared press since `fable/settings-20261127`) | Pinned folders are not drawn on the Dock; B-62 still needs a two-display real-PC check | A "focus the Dock" hotkey for Dock keys; then the ghost tour |
| Top Bar | [topbar.md](topbar.md) | works (Fable pass: B-108, minute clock, errors logged) | Focus strip (halo switch and transparency-off rule done in the Settings wave) | none open (B-108 fixed; the stale-rect suspicion is closed) | Focus strip under the clock |
| Settings | [settings.md](settings.md) | works (Fable pass `fable/settings-20261127`: accent tokens and Accent strength, B-58, B-111–B-114, Dock on the feel system) | "Recently changed" strip | none open in code (B-58 fixed) | "Recently changed" strip with Undo |
| Themes & backdrops | [themes.md](themes.md) | works (Fable pass `fable/settings-20261127`: the accent across Lens, contrast-checked for any colour) | Wallpaper folder dialog (every-pack contrast audit done in the Settings wave) | B-19 hard-coded colours (B-38 closed, B-39 fixed in #113) | "Lens Cloud" featured look (Backdrop preset done in #113) |
| Window styling | [windows-styling.md](windows-styling.md) | works (Fable pass, #115) | "Don't style this app" in the Dock menu | Left-side buttons not yet seen on a real PC | Per-app window rules page with locked "Protected" badge (first cut built, #115) |
| Command | [command.md](command.md) | works (Fable pass, #115) | 10 s Undo toast after an applied intent | B-12c first key after cold start (maybe CDP-only) | "Teach me": show where each setting lives after an intent (built, #115) |
| Setup, updates & safety | [setup-updates-safety.md](setup-updates-safety.md) | partly (Fable pass, #115: code ready, owner creates the key and first release) | Make updates shippable: signing key and first release (owner) | Empty updater pubkey in the repo is by design (injected by release.yml from the TAURI_UPDATER_PUBKEY variable); updates can't verify until the owner adds the key | Safety card in About (built, #115) |
| Lens Browser | [browser.md](browser.md) | see dossier | Local reader view | Agent approval is a UI boolean, not step-bound | Reader view with Ask as a side action |
| Desktop widgets | [desktop-widgets.md](desktop-widgets.md) | built, off by default (`magicWaves.desktopWidgets`) | Bluetooth device batteries | Host per monitor not built yet (Lens monitor only) | A host per monitor with its own layout |
| Magic | [magic.md](magic.md) | works (harness; Fable pass 26 Nov: Snip live text, B-116 to B-120, Shelf and history Undo) | Notifications get a real "Lens ›" menu | B-07 blocks "Get transcript" verbs | Menu key / Shift+F10 opens any Lens item's menu with Lens › focused (built for Shelf items) |
| AI and agents | [ai-agents.md](ai-agents.md) | see dossier | Pin B-07 checksums | Approval not step-bound; undo lost on restart | Plan view with per-step allow/deny |
| Music | [music.md](music.md) | Fable pass in PR #112 | Lyrics offset nudge per track (queue empty state done) | Meter may stay on the old output device (suspected; port fallback done) | One shared mini player (desktop lyrics built) |
| Cleaner | [cleaner.md](cleaner.md) | Fable pass in PR #112; deep pass (apps): global motion tokens, errors reported | Known-folder lookup for a moved Downloads folder (suspected S5), then the cloud note | Multi-drive bin undo unverified (suspected; one-time code done) | Tidy-up preview notification (Home timeline built) |
| Core apps + Lens Apps | [core-apps.md](core-apps.md) | works (harness); deep Fable pass (apps): Library with Update all, credits and licences, gallery, B-121–B-125 | Verify the 46 unchecked catalogue licences (Timer ↔ Notes and swallowed errors done) | None open in code; alarms across sleep and clock change need a real PC | Agent-ready Library (Command, voice, MCP) |
| Website | [site.md](site.md) | see dossier | Fix stale budget comment + oversized-icon check | App media fetch failure only warns; deploy can ship text-only apps grid | Dock-first hero with slow 3-step loop (redo branch) |

## Dock, Top Bar, Settings, Themes: what is left after the Fable pass (PR #113)

Quick wins still open in those four dossiers, ranked by value for the effort:

1. **Done (Settings wave).** ~~**Settings B-41**: the "Corner to edit" radios on Windows & Keys can't be clicked where they are drawn. A real, visible fault on a page people use.~~
2. ~~**Dock left/right edge E2E**~~: done (robustness wave), every style on both edges.
3. **Mostly done.** ~~**Swallowed errors (B-18)**~~ in the Dock, pop-outs, Magic and Dashboard (robustness wave) and Settings (Settings wave); `TopBarSurface.tsx` and `AgentsPane.tsx` remain.
4. **Done (Settings wave).** ~~**Contrast audit for every pack**, not only the featured twelve, failing CI on regressions (some light packs may miss 3:1 for the accent on cards).~~
5. **Done (Settings wave).** ~~**Top Bar halo switch** and no halo when Windows' transparency effects are off.~~
6. **Done (Settings wave).** ~~**Settings B-40**: Animated backdrop and startup-app switches unmount after one click (the duplicate name is fixed).~~
7. **Done (Settings wave).** ~~**A delay setting for closing pop-outs** (the switch exists; the 1.5 s / 1.8 s are fixed in `watcher.rs`).~~
8. **Done** (robustness and Settings waves). ~~**Sentence-case the Top Bar's own aria-labels**~~.
9. **Wallpaper**: folder picker dialog, palette chip copies hex, Next wallpaper in the Dock and Top Bar menus.
10. **Done (Fable pass, `fable/dock-20261126`).** ~~**Split `DockSurface.tsx`**~~: 2,916 → about 1,500 lines, rendered output byte-identical before the intended changes.

Ideas not built in this pass: Settings "Recently changed" strip with Undo; the "Lens Cloud" featured look (its Backdrop Lab preset is in); Dock "in 10 seconds" tour; Top Bar focus strip.

Needs a real PC: two displays with "Top Bar on every monitor" and "Follow the pointer" together (push into each display's top and bottom edge; every display keeps exactly one Top Bar), and the Top Bar switch off/on with extra bars.
