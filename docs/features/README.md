# Feature dossiers

One file per main feature, written for the Fable pass. Each has a rundown, a feature tree (features → sub-features → minute features, each with status and evidence), quick wins, a polish assessment, a bug assessment, one idea to push to main, a test plan, a suggested overhaul and a compact **Fable pass brief** to execute from.

Status words: **works** (built and tested), **partly** (built with gaps), **broken**, **not built**.

| Feature | File | Status | Top quick win | Top bug | Idea to push |
|---|---|---|---|---|---|
| Dock | [dock.md](dock.md) | works | Left/right edge E2E (hidden settings now in Dock & Bar › Advanced, #113) | B-18 swallowed errors (per-monitor bars + follow-the-pointer fixed as B-53, needs a real-PC check) | "Dock in 10 seconds" ghost tour after a style change |
| Top Bar | [topbar.md](topbar.md) | works | Halo off switch (one enable flag done in #113, B-52) | Halo ignores Windows' transparency-off (suspected) | Focus strip under the clock |
| Settings | [settings.md](settings.md) | works | Fix B-41 corner picker (page merge and "Lens Apps" done in #113) | B-41, B-40 unmounting switches (B-39 fixed in #113) | "Recently changed" strip with Undo |
| Themes & backdrops | [themes.md](themes.md) | works | Contrast audit for every pack (Dock-only duplicates merged, audit regenerated in #113) | B-19 hard-coded colours (B-38 closed, B-39 fixed in #113) | "Lens Cloud" featured look (Backdrop preset done in #113) |
| Window styling | [windows-styling.md](windows-styling.md) | works (Fable pass, #115) | "Don't style this app" in the Dock menu | Left-side buttons not yet seen on a real PC | Per-app window rules page with locked "Protected" badge (first cut built, #115) |
| Command | [command.md](command.md) | works (Fable pass, #115) | 10 s Undo toast after an applied intent | B-12c first key after cold start (maybe CDP-only) | "Teach me": show where each setting lives after an intent (built, #115) |
| Setup, updates & safety | [setup-updates-safety.md](setup-updates-safety.md) | partly (Fable pass, #115: code ready, owner creates the key and first release) | Make updates shippable: signing key and first release (owner) | Empty updater pubkey in the repo is by design (injected by release.yml from the TAURI_UPDATER_PUBKEY variable); updates can't verify until the owner adds the key | Safety card in About (built, #115) |
| Lens Browser | [browser.md](browser.md) | see dossier | Local reader view | Agent approval is a UI boolean, not step-bound | Reader view with Ask as a side action |
| Magic | [magic.md](magic.md) | see dossier | Notifications get a real "Lens ›" menu | B-07 blocks "Get transcript" verbs | Menu key / Shift+F10 opens any Lens item's menu with Lens › focused |
| AI and agents | [ai-agents.md](ai-agents.md) | see dossier | Pin B-07 checksums | Approval not step-bound; undo lost on restart | Plan view with per-step allow/deny |
| Music | [music.md](music.md) | Fable pass in PR #112 | Lyrics offset nudge per track (queue empty state done) | Meter may stay on the old output device (suspected; port fallback done) | One shared mini player (desktop lyrics built) |
| Cleaner | [cleaner.md](cleaner.md) | Fable pass in PR #112 | Weekly tidy-up summary in the Dashboard (scan time done) | Multi-drive bin undo unverified (suspected; one-time code done) | Tidy-up preview notification (Home timeline built) |
| Core apps + Lens Apps | [core-apps.md](core-apps.md) | Fable pass in PR #112 | Timer ↔ Notes reminders (one uninstall path done) | Timer alarms across sleep/resume (suspected; title watcher wired) | Shared "Today" strip in the Dashboard |
| Website | [site.md](site.md) | see dossier | Fix stale budget comment + oversized-icon check | App media fetch failure only warns; deploy can ship text-only apps grid | Dock-first hero with slow 3-step loop (redo branch) |

## Dock, Top Bar, Settings, Themes: what is left after the Fable pass (PR #113)

Quick wins still open in those four dossiers, ranked by value for the effort:

1. **Settings B-41**: the "Corner to edit" radios on Windows & Keys can't be clicked where they are drawn. A real, visible fault on a page people use.
2. **Dock left/right edge E2E**: copy `dock-bottom` for the two edges that have no Windows coverage.
3. **Swallowed errors (B-18)** on user actions in `DockSurface.tsx` and the Settings shell: route launch, focus, window and save failures through the failsafe reporter so a failed click says why.
4. **Contrast audit for every pack**, not only the featured twelve, failing CI on regressions (some light packs may miss 3:1 for the accent on cards).
5. **Top Bar halo switch** and no halo when Windows' transparency effects are off.
6. **Settings B-40**: Animated backdrop and startup-app switches unmount after one click (the duplicate name is fixed).
7. **A delay setting for closing pop-outs** (the switch exists; the 1.5 s / 1.8 s are fixed in `watcher.rs`).
8. **Sentence-case the Top Bar's own aria-labels** ("Volume and Audio Mixer", "Wi-Fi and Network").
9. **Wallpaper**: folder picker dialog, palette chip copies hex, Next wallpaper in the Dock and Top Bar menus.
10. **Split `DockSurface.tsx`** (context menu first). No behaviour change, goldens unchanged.

Ideas not built in this pass: Settings "Recently changed" strip with Undo; the "Lens Cloud" featured look (its Backdrop Lab preset is in); Dock "in 10 seconds" tour; Top Bar focus strip.

Needs a real PC: two displays with "Top Bar on every monitor" and "Follow the pointer" together (push into each display's top and bottom edge; every display keeps exactly one Top Bar), and the Top Bar switch off/on with extra bars.
