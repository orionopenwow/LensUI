# Landscape (refreshed 22 November 2026)

Fifteen lookups across the products Lens is compared with. Each row: what changed, then what Lens should do. Quotes are under 15 words, at most one per source; everything else is paraphrased.

## Desktop shells and customizers

**Seelen UI** — [v2.7.0 release notes](https://seelen.io/apps/seelen-ui/releases/v2.7.0) (installers dated June 2026). Added an Icon Editor widget so people can build their own icon packs, min/max limits on numeric settings so layouts can't break, a better input-method indicator, single-wallpaper selection, dock autohide disabled on touch screens, and app icons in dock context menus; many tiling-WM fixes around fullscreen apps and always-on-top. No AI features.
*Lens should:* keep its lead on AI and agent safety, but match the hygiene: clamp every numeric setting in the `control` schema (Lens's sliders already clamp in UI, not in the registry), and disable dock autohide on touch.

**Raycast for Windows** — [v2.13, 18 Nov 2026](https://raycast.com/changelog/windows) and [2.0, Aug 2026](https://www.raycast.com/changelog/windows/2-0). 2.0 ended the beta and moved Dictation and AI Chat into Pro. 2.13 ships a local Raycast MCP server so Claude, Codex and Cursor can drive Raycast, AI tools over clipboard and notes (delete, pin, rename), screenshot attachments in AI chat, and a much faster, leaner clipboard history; 2.12 rebuilt the calculator.
*Lens should:* treat Raycast as the direct competitor for Command. Lens's edge is the whole desktop plus visible, reversible agent actions (presence, undo, Remove all). Close the gaps: one fast clipboard history (SCOPE dup #1), dictation polish (context-aware spacing), and make the MCP story equally simple (Lens already has one-click Claude Desktop setup; add Codex/Cursor configs).

**PowerToys** — [0.101, 25 Aug 2026](https://devblogs.microsoft.com/commandline/powertoys-0-101-is-here-window-hopper-insider-updates-and-command-palette-compact-mode/). Window Hopper (Alt+backtick cycles windows of the current app), Command Palette compact mode, a Command Palette **dock** with auto-hide, a clock and a notification bell, Stable/Insider channels, and on-device Phi Silica transforms in Advanced Paste.
*Lens should:* expect Microsoft to keep absorbing launcher-plus-dock basics for free. Differentiate on design, ambient desktop and agents; add a same-app window cycler to the keyhook (cheap, beloved); consider on-device models for Shelf transforms where Windows exposes them.

**Windhawk** — [WindowsForum analysis, 14 Sep 2026](https://windowsforum.com/news/windhawk-on-windows-11-customization-vs-risk.444400/?amp=1). Coverage of the risks of injection-based mods: anti-cheat intolerance (Windhawk excludes many game paths), antivirus conflicts, an unverified DLL search-order report, pre-compiled mod downloads since 1.7, and breakage after Windows updates. Advice: back up, start narrow, disable before anti-cheat games.
*Lens should:* this is exactly B-05. Lens's own global hook DLL should not stay mapped in game processes; prefer the out-of-process DWM engine and keep Windhawk sync optional. Say in Settings, plainly, which features inject and which don't.

**Stardock Start11** — [2.6, 28 Jan 2026](https://www.wincustomize.com/article/540732/), earlier [v2.5 vertical taskbar](https://prnewswire.com/news-releases/stardock-releases-start11-v2-5-with-vertical-taskbar-support-on-windows-11--302352106.html). Recent releases focus on deployment controls (hide All Apps, hide shutdown, static sizing, disable context menus), RDP behaviour and dark-mode legibility.
*Lens should:* there is an enterprise market for "locked" desktops. Lens's `control` registry plus grants is a natural policy file; a read-only "managed" mode (settings pinned by an admin JSON) is a small step after `control` becomes the only writer.

## Agentic browsers and the OS

**Dia / Atlassian** — [Atlassian announcement, 4 Sep 2025](https://www.atlassian.com/blog/announcements/atlassian-acquires-the-browser-company), [Team '26 session](https://events.atlassian.com/team/session/4059946/your-browser-reimagined-for-work-dia-+-atlassian-in-action). Atlassian bought The Browser Company to make Dia the browser for knowledge work: tabs enriched with work context, AI skills, a personal work memory across apps, and admin/compliance controls.
*Lens should:* Lens Browser + Shelf + context packs already cover "context across tabs and apps" at the desktop level. Lean in: a Shelf pack should be one click to attach in any AI surface, and spaces in Lens Browser should map to Lens workspaces.

**Perplexity Comet** — [Tom's Guide, Oct 2025](https://www.tomsguide.com/ai/perplexity/perplexitys-ai-browser-comet-is-now-free-for-everyone-heres-how-to-download-it), [Windows beta coverage](https://www.techrepublic.com/article/news-perplexity-ai-powered-comet-browser/). Comet is free on Windows and Mac, with the assistant at the centre of browsing and able to answer about the page you're on.
*Lens should:* an assistant that reads every page is exposed to text planted in those pages (prompt injection). Lens's browser agent should not ship more widely until B-04 is closed.

**Windows agentic security** — [Microsoft Learn: operating system agentic security](https://learn.microsoft.com/en-au/windows/security/book/operating-system-agentic-security), [Experimental agentic features](https://support.microsoft.com/en-us/windows/ai/ai-features/experimental-agentic-features). Windows runs agents under separate standard accounts in an "agent workspace" with its own desktop, least-privilege access to known folders, extra approval for sensitive actions, visible step-by-step progress with take-over, and signed agents that can be revoked. Off by default.
*Lens should:* align vocabulary and model: Lens's actors map to agent accounts, presence maps to visible progress, grants map to least privilege. Plan an adapter so Lens can launch long tasks into the Windows agent workspace instead of the person's desktop when available, and require signed MCP clients for high-risk grants.

## Messaging and feeds

**Beeper** — [June 2026 update](https://blog.beeper.com/2026/06/23/beeper-june/). Added a LINE bridge (cloud), better iMessage on macOS, richer call notifications, a **Raycast extension** for Beeper Desktop, and roughly 2× faster desktop startup and sync; no AI or public API news in that post.
*Lens should:* Lens Messages opens official apps and mirrors toasts; a Beeper integration (when Beeper Desktop is installed) would give a real unified inbox without Lens storing credentials. Same pattern as Raycast: integrate, don't rebuild.

## Cleaners (for the in-flight Lens Cleaner)

**CleanMyMac / CleanMyPC** — [MacPaw: CleanMyMac Business sunset](https://macpaw.com/news/cleanmymac-business-sunset), [MacRumors on the 2024 redesign](https://www.macrumors.com/2024/10/16/macpaw-releases-redesigned-cleanmymac/), [BetaNews on CleanMyPC](https://betanews.com/article/macpaw-claws-away-windows-clutter-with-cleanmypc/). MacPaw redesigned the consumer Mac product around a calm, single-scan flow (2024) and is sunsetting its business edition; its Windows cleaner, CleanMyPC, is an older product line. (Titles and summaries only; not re-read in full this pass.)
*Lens should:* there's room on Windows for a calm, trustworthy cleaner. Lens Cleaner must be the opposite of registry-cleaner culture: preview every deletion, move to Recycle Bin by default, route through the shared approval card, and record every action for Remove all.

## Live wallpapers and skies (for the in-flight Living skies)

**Wallpaper Engine** — [PC Games Hardware, 1 Jul 2026](https://www.pcgameshardware.de/Steam-Software-69900/News/Hit-Wallpaper-Engine-Wichtige-Aenderung-nach-Sicherheitsproblem-1546948/). After malware was found in Workshop "Application" wallpapers (executables), version 2.8.42 removed that wallpaper type from the public Workshop; the developers put it at about 0.5% of wallpapers.
*Lens should:* never run executables as wallpapers. Lens's HTML wallpapers should stay sandboxed (no Node, no file access, CSP), and shared scenes should be data (shader/scene JSON) rather than code.

**Weather Wallpaper (Steam)** — [store page](https://store.steampowered.com/app/4736970), released 16 June 2026. A paid WebView2 app that shows animated live-weather scenes behind desktop icons, with rain and snow effects on icons and the taskbar.
*Lens should:* Living skies is a validated idea with paying users. Lens's advantage: the sky can tint the whole theme (accent from sky, dim at night), respect battery/fullscreen pauses already in `win_wallpaper`, and stay free.

**Lively Wallpaper** — [Windows Central hands-on](https://www.windowscentral.com/software-apps/i-finally-tried-lively-wallpaper-to-animate-my-desktop-its-a-dream-for-customization). The free, open-source baseline for animated wallpapers on Windows: video and web wallpapers with pause rules. (Background knowledge; the article was not re-read this pass.)
*Lens should:* match its pause rules (fullscreen, battery, maximised window) and import its web wallpapers where they are pure HTML.

## What this means for the next pass

1. **Safety first is now the market expectation**, not a differentiator: Windows, Comet coverage and the Windhawk discussion all centre on injection and agent risk. Close B-04 and B-05 before adding agent features.
2. **Raycast and PowerToys are converging on Lens's Command + dock.** Lens wins on the whole-desktop design and visible, reversible agents; it must not lose on speed (clipboard, cold start).
3. **Integrate over rebuild** (Beeper, Raycast-style MCP configs, Windows agent workspace).
4. **Cleaner and Living skies have clear demand**; ship both with Lens's reversibility guarantees as the headline.

## Cross-platform plan (macOS and Linux)

Written with site v3, which now states platform status on the Download page (`download.html#platforms`).

- **Today.** Lens is a Windows 10/11 shell. 78 of the Rust modules in `src-tauri/src` gate their work on `cfg(windows)`; the portability workflow only runs `cargo check` on macOS and Ubuntu, so nothing runs there. The site says "on the roadmap", never "coming soon" with a date, and points to GitHub Releases.
- **Already portable.** `.lenstheme` files (plain JSON), the theme packs (`src/themes`), the playground and living backdrops (canvas/WebGL, `src/playground`), Lens Command's intent engine, the Guide index and search, and the website's desk demo.
- **Not portable.** The dock as a taskbar replacement, window styling and the DWM hook, keyboard and mouse hooks, tiling, Explorer integration, the Cleaner's Windows paths, toast mirroring, and Windows Settings pages.
- **First steps, in order.**
  1. Split `src-tauri` into a platform trait (`Shell`: windows list, focus, launch, wallpaper, notifications) with the Windows implementation behind it. This doesn't change behaviour; CI keeps it green.
  2. Run Lens on Linux (GNOME/KDE) as an app, without replacing the shell: Command, Shelf, Browser, Music, themes and the living wallpaper as a window. Ship it as an AppImage or Flatpak beta.
  3. Do the same on macOS: a menu-bar app with Command, Shelf, Browser and themes. The dock stays macOS's own.
  4. Then decide per platform whether a dock or panel replacement is worth it (KDE Plasma applets and GNOME extensions are the native routes).
- **Website.** When step 2 ships, change the Linux card on `download.html` from "On the roadmap" to "Preview" and add a download link. `home.js` OS detection already routes Mac and Linux visitors to the platform section.
