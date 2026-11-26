# Feature dossiers

One file per main feature, written for the Fable pass. Each has a rundown, a feature tree (features → sub-features → minute features, each with status and evidence), quick wins, a polish assessment, a bug assessment, one idea to push to main, a test plan, a suggested overhaul and a compact **Fable pass brief** to execute from.

Status words: **works** (built and tested), **partly** (built with gaps), **broken**, **not built**.

| Feature | File | Status | Top quick win | Top bug | Idea to push |
|---|---|---|---|---|---|
| Dock | [dock.md](dock.md) | works | Expose hidden Dock settings (magnification, launch animation, labels, per-app sizes…) | Per-monitor bars + follow-the-pointer together untested (suspected) | "Dock in 10 seconds" ghost tour after a style change |
| Top Bar | [topbar.md](topbar.md) | works | One enable flag (`topBar.enabled` vs `dock.showTopBar`) | The two flags can disagree (suspected) | Focus strip under the clock |
| Settings | [settings.md](settings.md) | works | Merge Notifications pages; rename "Apps" → "Lens Apps" | B-39 undo doesn't restore every key | "Recently changed" strip with Undo |
| Themes & backdrops | [themes.md](themes.md) | works | Prune near-duplicate looks that only differed by Dock; regenerate audit | B-39 undo leaves folder colours / schedule; B-38 is stale (close) | "Lens Cloud" featured look + Backdrop preset |
| Window styling | [windows-styling.md](windows-styling.md) | partly | Caption engine uses `win_rules::ANTI_CHEAT_FRAGMENTS` + honours `excluded_processes` | Engine's private anti-cheat list misses most of the 42 names (suspected, safety) | Per-app window rules page with locked "Protected" badge |
| Command | [command.md](command.md) | works | Move Snip off Ctrl+Shift+S (Save As) | B-12c first key after cold start (maybe CDP-only) | "Teach me": show where each setting lives after an intent |
| Setup, updates & safety | [setup-updates-safety.md](setup-updates-safety.md) | partly | Make updates shippable: signing pubkey, endpoint, first release | Empty updater pubkey in the repo is by design (injected by release.yml from the TAURI_UPDATER_PUBKEY variable); updates can't verify until the owner adds the key | Safety card in About |
| Lens Browser | [browser.md](browser.md) | see dossier | Local reader view | Agent approval is a UI boolean, not step-bound | Reader view with Ask as a side action |
| Magic | [magic.md](magic.md) | see dossier | Notifications get a real "Lens ›" menu | B-07 blocks "Get transcript" verbs | Menu key / Shift+F10 opens any Lens item's menu with Lens › focused |
| AI and agents | [ai-agents.md](ai-agents.md) | see dossier | Pin B-07 checksums | Approval not step-bound; undo lost on restart | Plan view with per-step allow/deny |
| Music | [music.md](music.md) | see dossier | Queue panel empty state with inline Connect Spotify | Spotify loopback port 43117 taken → connect fails silently | Lyrics on the desktop (opt-in click-through line) |
| Cleaner | [cleaner.md](cleaner.md) | see dossier | Show measured scan time (Done screen + Tester Hub) | Confirm token is a deterministic hash, not a server nonce | "Where did my space go?" 30-day timeline from daily snapshots |
| Core apps + Lens Apps | [core-apps.md](core-apps.md) | see dossier | One uninstall path (Cleaner → Startup & Uninstall) | `messages_space_title` has no caller → web-app unread badges never update | Shared "Today" strip in the Dashboard |
| Website | [site.md](site.md) | see dossier | Fix stale budget comment + oversized-icon check | App media fetch failure only warns; deploy can ship text-only apps grid | Dock-first hero with slow 3-step loop (redo branch) |
