# Research sources catalogue

Where the daily research lookout and the twice-weekly combinator scan look, ranked by how often each source has something Lens can use. It's living: each run may add sources that proved useful, demote ones that didn't, and record what it couldn't reach. The scans read this file first.

| | |
|---|---|
| Used by | Daily research lookout (05:13 Phoenix), combinator scan (Mon/Thu 03:47 Phoenix) |
| Rules | Public pages only, no logging in, no scraping behind sign-ins. Quotes under 15 words, at most one per source; paraphrase the rest. Say when something couldn't be verified or reached. Credit the author when an idea comes from a post |
| Owner | Campton; the scans keep "Last useful" current |

## 1. How to read social signals

A post matters for Lens when it shows **demand** ("how do I…", "I wish Windows…", "is there an app that…"), **delight** (a desktop setup or feature people share widely), or **pain** (a bug or change people complain about). Rank what you find by:

- **Velocity:** reactions or comments in the first 24–48 h, relative to that community's usual numbers.
- **Spread:** the same idea showing up in two or more communities (X and Reddit and HN, say).
- **Fit:** it touches a Lens area (dock, bar, themes, windows, Magic, browser, music, widgets, agents, capture, privacy).
- **Recency:** last 7 days for the daily lookout; last 30 for the combinator scan.

A demand post with high fit beats a viral post with low fit. Record each signal as one line: source, date, what people want, Lens status, link.

## 2. X (Twitter)

X needs a sign-in to browse, so search for posts through web search:
- query `site:x.com <terms>` with a recent date range;
- fetch the individual post URLs that come back;
- if a post can't be read, look for it quoted on Reddit, HN or in news, and say it was unread.

| Search | Finds |
|---|---|
| `site:x.com "windows 11" (rice OR riced OR setup OR desktop) customization` | Viral desktop setups, what people show off |
| `site:x.com (dock OR taskbar) windows (app OR mod) -crypto` | Dock and taskbar tools going viral |
| `site:x.com ("seelen" OR "windhawk" OR "startallback" OR "explorerpatcher")` | Talk about direct alternatives |
| `site:x.com ("raycast windows" OR "powertoys" OR "command palette")` | Launcher and command-bar demand |
| `site:x.com ("arc browser" OR "dia browser" OR "zen browser" OR "comet") windows` | Browser switching moments |
| `site:x.com ("claude code" OR "codex" OR "mcp") (desktop OR "computer use" OR browser)` | Agent-on-the-desktop demand and demos |
| `site:x.com ("open source" alternative) (mac OR windows) app` | "Open-source X for Y" announcements (combinator leads) |
| `site:x.com (widgets OR "menu bar" OR "notch") app windows` | Widget and bar ideas from the Mac world that Windows lacks |

Accounts worth checking each week (verify each still posts; add or prune as runs find better ones): Windows Insider and Microsoft Windows official accounts, the PowerToys team, Tauri, Anthropic, Raycast, Zen Browser, The Browser Company, Seelen UI, Windhawk, Rainmeter.

## 3. Reddit

Use web search with `site:reddit.com/r/<sub>` plus recent terms. If fetching is allowed, fetch `https://www.reddit.com/r/<sub>/top/?t=day` (or `t=week`). Count comments as well as upvotes: long threads mean real pain.

| Subreddit | Why | Sort |
|---|---|---|
| r/desktops | Setups that go viral; what people are copying | top/day |
| r/unixporn (Windows and "OC" posts) | The aesthetic bar to beat; ideas from Hyprland and KDE to bring to Windows | top/week |
| r/Windows11 | Pain with Windows changes, "how do I" posts | top/day + new "how do I" |
| r/Windows10 | People not moving to 11, and their reasons | top/week |
| r/WindowsHelp | Repeated problems Lens could solve | search "taskbar", "start menu", "dock" |
| r/Rainmeter, r/windhawk (if active) | Customisers, widget demand | top/week |
| r/PowerToys | Feature requests Microsoft hasn't shipped | top/week |
| r/browsers, r/ArcBrowser, r/zen_browser | Browser switching, Arc users moving | top/day |
| r/opensource, r/selfhosted, r/software | New open-source tools (combinator leads) | top/week |
| r/LocalLLaMA, r/ClaudeAI, r/ChatGPTPro | Local models, MCP servers, computer-use agents | top/day |
| r/productivity, r/ADHD (productivity threads) | Focus, notes, quick-capture demand | top/week |
| r/battlestations, r/MechanicalKeyboards | Desk and setup culture; hotkey and macro ideas | top/week |
| r/SteamDeck, r/Controller | ThumbDesk-adjacent demand (desktop from a controller) | top/week |

## 4. Launch and tech communities

| Source | How | Finds |
|---|---|---|
| Hacker News | `https://news.ycombinator.com/front`, plus "Show HN" via `site:news.ycombinator.com "Show HN" <terms>` | Open-source launches, performance talk, honest critiques |
| Lobsters | `https://lobste.rs/` (tags: release, show) | Technical open-source releases |
| Product Hunt | `site:producthunt.com <terms> windows` | Polished consumer tools, launch copy that works |
| GitHub Trending | `https://github.com/trending?since=daily` and by language (Rust, TypeScript, C#, C++) | Fast-rising repos (combinator leads) |
| GitHub search API | `search/repositories?q=topic:windows-customization+pushed:>DATE&sort=stars` (also `topic:dock`, `topic:tiling-window-manager`, `topic:mcp-server`, `topic:local-llm`, `topic:screenshot`, `topic:launcher`) | Rising projects by topic |
| Mastodon (fosstodon.org) | `https://fosstodon.org/tags/opensource`, `/tags/rust` | Open-source maintainers' announcements |
| Bluesky | web search `site:bsky.app <terms>` | Design and dev community chatter |
| YouTube | search "windows 11 customization 2026", "best windows apps"; channels that review Windows tools | What reaches non-developers; which features demo well |

## 5. Primary sources (always check for the area of the day)

| Area | Sources |
|---|---|
| Windows platform | Windows Insider blog and flight notes; Windows Developer blog; WinUI and Windows App SDK release notes; PowerToys releases |
| Shells and customisers | Releases of Seelen UI, Windhawk (and windhawk-mods), StartAllBack, ExplorerPatcher, Rainmeter, TranslucentTB, Lively Wallpaper, komorebi, GlazeWM, Nilesoft Shell |
| Browsers | Arc, Dia, Zen, Comet, Opera Neon, Edge and Chrome AI release notes; Ardia (Learn only, GPL); WebView2 release notes; Tauri releases and blog |
| AI and agents | Anthropic news and API changelog; the MCP spec repository; Ollama, LM Studio, llama.cpp, whisper.cpp releases; Raycast changelog |
| Capture and media | ShareX, Flameshot, Greenshot releases; Cider (Learn only); Spicetify; LRCLIB |
| Security | GitHub advisories for Tauri, WebView2, reqwest and every crate in `src-tauri/Cargo.toml`; RustSec |

## 6. News (background and confirmation, not primary evidence)

Windows Central, Neowin, XDA Developers, The Verge (Windows and AI), gHacks, BetaNews, WindowsForum, Ars Technica, 9to5Mac (for Mac ideas that Windows lacks), Tom's Hardware (performance).

## 7. Design inspiration (for the site and UI, never copied)

Godly, Land-book and Awwwards (site patterns); Mobbin (app flows); Dribbble and Behance (searches such as "dock", "widgets", "music player", "browser sidebar"). Pages of well-loved open-source apps: Ardia, Cider, Zen, Raycast, Linear's changelog style. These go into ideas only, never assets.

## 8. Rotation (daily lookout emphasis by weekday)

| Day | Emphasis | Lead sources |
|---|---|---|
| Mon | Dock and taskbar | r/desktops, r/Windows11, X searches 1–3, Seelen/Windhawk/StartAllBack releases |
| Tue | Themes, window styling, wallpaper | r/unixporn, r/Rainmeter, Lively and Wallpaper Engine news, design sites |
| Wed | AI, voice, Command, Shelf, clipboard | r/LocalLLaMA, r/ClaudeAI, Anthropic/MCP, Raycast, whisper.cpp |
| Thu | Browser, right-click, context tools | r/browsers, r/ArcBrowser, browser release notes, X search 5 |
| Fri | Snipping and capture | ShareX/Flameshot releases, r/software, Product Hunt |
| Sat | Productivity and window management | r/productivity, r/PowerToys, GlazeWM/komorebi, HN |
| Sun | Security and Windows Insider changes | Insider blog, RustSec, GitHub advisories, r/Windows11 "broke" threads |

Every day also gets a quick pass over HN front page, GitHub Trending and the X searches for big news.

## 9. Ledger (kept by the scans)

| Source | Last useful | Hits (30 days) | Reachable? | Note |
|---|---|---|---|---|
| (filled in by runs) | | | | |
