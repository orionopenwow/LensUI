# Lens Desktop, the open-source combinator: long-running plan

The plan for making Lens the desktop that brings the best of open source together, credits it properly, rebuilds what people use most in one light, coherent interface, and lets the Lens agent use all of it. It covers the philosophy, the brand (Lens by Campton), how projects come in, the licence rules, the scan that feeds it, and the horizons.

| | |
|---|---|
| Owner | Campton (decisions); agents keep it current |
| Started | 26 November 2026 |
| Reviewed | Monthly (§10), plus whenever a horizon closes |
| Related | [IDENTITY.md](IDENTITY.md) (mission, promises, look: wins on conflict), [MODULES.md](MODULES.md) (Lens's own pieces as standalone editions and repos), [FEATURES.md](FEATURES.md), [LANDSCAPE.md](LANDSCAPE.md), [SCOPE.md](SCOPE.md), [`docs/combinator/`](../combinator/) (catalogue and scan reports), `docs/MASTERPLAN.md` / the Project's MASTERPLAN (metrics, release train) |

Anything marked **open** is not decided. Don't present it as settled on the site or in the app.

---

## 1. The thesis

Open source already holds a great tool for nearly everything people do on a desktop. What it lacks is a **desktop that unifies them**: today they look different, are installed differently and don't talk to each other. Nothing ties them to one assistant you can trust.

**Lens is the combinator.** It is one free, open-source desktop where:

1. **Everything looks like one product.** Dock, top bar, themes, windows, browser and small apps share one design language (IDENTITY §3).
2. **The best projects are one click away and properly credited.** Lens Apps installs official releases and shows who made them and under which licence.
3. **The 20 % of each tool people use 80 % of the time is rebuilt light inside Lens.** It uses Lens's own UI, settings writer, approvals and undo, and the full project stays one click away.
4. **The agent can use all of it.** Every combined capability is registered as an intent, a control and an MCP tool. Lens (the AI), voice, Magic, Magic Mouse and Command can drive it visibly and reversibly.

One-line positioning, for the site and the pitch: **"The open-source desktop where the best of open source finally works as one."** (It extends the current hero line; adopting it is **open**.)

### Why it can win

- **Coherence is the gap.** Each open-source tool is great alone. None of them is a desktop. Shells (Seelen UI, Windhawk, PowerToys) customise the desktop but don't unify apps. Launchers (Raycast, Flow) unify actions but aren't a desktop. Lens is both.
- **Trust is the moat.** The promises in IDENTITY §1 apply to everything Lens combines: local-first, off by default, reversible, approval for what matters, games untouched, honest copy. A combinator that broke them would lose its reason to exist.
- **Credit is the growth engine.** Giving maintainers visible credit, traffic and contributions turns them into allies who share Lens, not competitors who resent it.

---

## 2. Philosophy: the ten combinator rules

1. **Unify, don't absorb.** Prefer linking, bridging and contributing upstream over rewriting. Rewrite only where a light native version clearly beats a separate app for most people.
2. **Rewrite light.** A Lens rewrite does the everyday core in Lens's UI, idles at near-zero cost, and hands off to the full project ("Open in <project>") for everything else.
3. **Credit first, always.** Every combined or inspired feature names its upstream project, links it and states the licence in the app (About › Credits, plus the feature's own info row) and on the site.
4. **Licences are rules, not suggestions.** See §5. Never copy GPL/AGPL code into the MIT codebase. Rewrites from GPL projects are clean-room, built from behaviour and docs.
5. **Agent-ready by construction.** Nothing is "done" until it has an intent, a control-catalogue entry and an MCP tool. Risky steps go through the one approval card.
6. **One of everything.** One clipboard history, one settings writer, one change registry, one approval card, one motion system (IDENTITY §6). A combined feature joins these and never brings its own.
7. **Off by default, reversible always.** Every combined feature starts off and is covered by Remove all.
8. **Local-first.** A combined capability that needs the network says so on its card and uses Lens's approved-site fetch. It never makes silent calls.
9. **Measured.** Every combined feature gets a parity scene, perf budget and test plan before it is called done (the dossier template in `docs/features/`).
10. **Give back.** Bugs found while combining are reported upstream; fixes are offered upstream first. A share of any future supporter income goes to the projects Lens depends on most (**open**: mechanism and percentage).

---

## 3. Brand projection: Lens by Campton

### 3.1 Brand architecture

| Layer | Name | Role | Status |
|---|---|---|---|
| Maker | **Campton** | The person and studio name everything launches under: author, voice of the launch, home of the product family | **Decided** (26 Nov 2026) |
| Flagship | **Lens** (descriptor: *Lens Desktop* where the context needs it) | The open-source desktop combinator | **Decided**: product name "Lens" (IDENTITY §2). Using "Lens Desktop" as a descriptor is **open** |
| Lens family | Lens Browser, Lens Music, Lens Cleaner, Lens Apps, Lens Feeds, Lens Messages, Lens Notes, Lens Snip | First-party apps inside Lens | Decided (IDENTITY §2) |
| Sibling products | **Tribe Code**, **ThumbDesk** | Campton products with their own names that integrate with Lens | **Decided** that they launch under Campton. Tribe Code's one-line description and how it joins Lens are **open** |

How it reads:
- **Site footer:** "Lens is made by Campton. Also by Campton: Tribe Code · ThumbDesk."
- **About page in the app:** "Lens · made by Campton · MIT licensed · Credits".
- **Repo README:** "by Campton".

Technical names (repo `orionopenwow/LensUI`, `%APPDATA%\LensUI`) stay as they are; see IDENTITY §2 for why. Moving the repo to a Campton GitHub organisation is **open**. It would need redirects and an updater endpoint check first.

### 3.2 What the brand stands for

- **The craftsman of open source.** It takes the best tools, gives them one beautiful home, and puts the makers' names on the wall.
- **Calm power.** A desktop that can do everything, but shows only what you need: matte and minimal, with one rainbow moment (the Lens cloud).
- **Honest by default.** It only claims what is built; it states the licence, the source and what an action will change.

### 3.3 Projection ideas (all open until picked)

1. **"Rebuilt in Lens" series.** One short video or post per combined feature, showing the original project, the light Lens version, the credit, and the agent using it. It doubles as the upstream thank-you.
2. **The Credits Wall.** A site page listing every project Lens combines, links to or learned from, with licence, maintainer and a "Sponsor them" link. It is generated from the catalogue (§6), so it is always current.
3. **"One desktop" demo loop.** A 30-second hero: dock style switch → Magic Mouse grab → Lens AI cursor navigating → voice command → Lens Apps install. Each step names the open-source project behind it.
4. **Maintainer program.** Upstream maintainers get early builds, a direct line for bugs Lens finds, and a featured card in Lens Apps.
5. **Campton launch narrative.** "One person and a fleet of agents built the desktop open source deserved." Show the waves, Fable passes and test rigs openly as a build-in-public thread on X. It fits the existing X campaign plan.
6. **Combinator Fridays.** A weekly public changelog entry: what came in this week, from which project, and what the agent can now do with it.
7. **Theme and widget makers as co-authors.** The Lens Apps and theme galleries credit creators the same way, so community work is part of the combinator.

### 3.4 Guardrails for projection

- Never imply an upstream project endorses Lens. Use the line "Names belong to each project; Lens isn't affiliated", already on the site.
- No upstream logos as Lens icons; Lens draws its own icons. Real screenshots are allowed when credited and taken from the project's own repo.
- Don't publish comparisons ("lighter than X") until the perf rig has measured them (MASTERPLAN PERF-1).

---

## 4. How a project comes in: the four modes

Every catalogued project gets exactly one primary mode. It can move up over time.

| Mode | What Lens does | When | Example shape |
|---|---|---|---|
| **Link** | One-click official install in Lens Apps, with credits, icon, screenshot and licence | The project is excellent and people want the whole thing | OBS Studio, Krita, Blender, AFFiNE |
| **Bridge** | Lens talks to the project (CLI, local API, MCP, file format, protocol), so the agent, Command and Magic can use it; the project keeps its own UI | The project exposes a stable interface; a Lens UI would add little | Ollama (local models), whisper.cpp (voice), ffmpeg (Snip recording) |
| **Rewrite light** | Lens rebuilds the everyday core in its own UI, wired into the one-of-everything systems, with "Open in <project>" for the rest | The core is small, used daily, and a separate app costs memory, attention or consistency | Clipboard history, snipping, window snapping, launcher, music mini-player, desktop widgets |
| **Learn** | Ideas, UX patterns or algorithms only, credited in the feature's dossier | Licence or architecture rules out more | GPL desktop tools whose interaction ideas inspire a Lens feature |

### 4.1 Scoring (the catalogue's rank)

The score runs from 0 to 100 and is the sum of seven parts:

| Part | Max points |
|---|---|
| Reach: how many Lens users would use it weekly | 25 |
| Pain removed: how many apps, windows or steps it replaces | 20 |
| Agent value: what the Lens agent can newly do with it | 15 |
| Lightness: how cheaply it can be done well in Lens | 15 |
| Health: activity, releases, maintainers, security record | 10 |
| Licence fit for the chosen mode | 10 |
| Brand fit: does it make Lens more coherent and calm | 5 |

A project needs ≥ 60 to be proposed for a wave and ≥ 75 to be a "Rewrite light" candidate. Anything that touches input, screen, clipboard, files or the network also needs a privacy review (MASTERPLAN §2.4).

### 4.2 Lifecycle

`Discovered` (by the scan) → `Catalogued` (scored, mode chosen) → `Proposed` (monthly review picks it) → `Dossier` (in `docs/features/`, using the existing dossier template: sub-features, quick wins, polish, bugs, test plan, overhaul) → `Built` (a wave, then a Fable pass) → `Shipped and credited` (Credits Wall, Lens Apps, "Rebuilt in Lens" post) → `Maintained` (the scan watches upstream releases and security advisories).

---

## 5. Licence and ethics rules (binding)

Lens is MIT. The rules for each upstream licence:

| Upstream licence | Copy code? | Bundle or ship binaries? | Rewrite light? | Required credit |
|---|---|---|---|---|
| MIT, BSD, ISC, Zlib, Apache-2.0, Unlicense, CC0 | Yes, keep the notice. Apache-2.0 also needs NOTICE files and a record of changes | Yes, with notices | Yes | `THIRD_PARTY_NOTICES` entry plus Credits |
| MPL-2.0 | Only as whole, unmodified-file dependencies; changes to those files stay MPL | Yes, with source offer for MPL files | Yes, clean-room for anything new | Notices plus Credits |
| LGPL | Only as dynamically linked libraries, never copied into Lens source | Yes, dynamically linked, with notices and relink ability | Yes, clean-room | Notices plus Credits |
| GPL, AGPL | **Never** copied into Lens. Lens Apps may install the official release (Link) or talk to it over a process boundary (Bridge, e.g. a CLI) | Only as a separate program the user installs; never linked into Lens | Clean-room only: from behaviour, docs and UI observation; no reading the source while writing the Lens version | Credits ("inspired by") |
| No licence, or "source available" | No | No | Learn only | Credits if an idea is used |
| Fonts, icons, artwork | Only under their own licence (OFL, CC-BY …); never upstream logos as Lens icons | Per licence | n/a | Per licence |

Other rules:
- **Clean-room record.** Each "Rewrite light" dossier states what it was built from (docs, behaviour, screenshots) and that no GPL/AGPL source was copied.
- **Trademarks.** Project names are used only to describe and credit them. Lens never names a feature after an upstream project.
- **Security.** Lens Apps installs only official releases with checksums or signatures where the project publishes them (today's verified-download path). Bridges run upstream tools as separate processes with only the permissions the approval card shows.
- **No scraping behind sign-ins.** The scan only reads public pages, public APIs and public repos.

---

## 6. The pipeline: the scheduled open-source scan

A scheduled task, **"Lens open-source combinator scan"**, runs twice a week (Monday and Thursday, early morning Phoenix time). It is separate from the daily research lookout, which watches competitors, Windows changes and security.

**Inputs:** GitHub search (by topic, recent stars, recent releases), curated awesome lists (Windows, self-hosted, productivity, local AI, desktop customisation, creative tools), the maintainers of projects already in the catalogue, and Hacker News / Reddit threads about open-source desktop tools. Each run takes 3–4 categories in rotation, so every category gets a deep pass every two to three weeks:

| Category | Covers |
|---|---|
| Desktop and shell | Docks, bars, launchers, tiling and snapping, widgets, wallpaper, pointers, context menus |
| Productivity | Notes, tasks, calendars, clipboard, file managers, search, PDF, office |
| Capture and media | Snipping, recording, OCR, image and video editing, music, podcasts |
| AI and agents | Local models, voice (STT/TTS), MCP servers, computer-use agents, RAG over local files |
| Dev and power users | Terminals, git UIs, API clients, system monitors, cleaners, package managers |
| Creative | Painting, 3D, design, fonts, colour tools |
| Communication and feeds | RSS, messaging bridges, email clients |
| Browsers and web | Light browsers, extensions, readers, ad-blocking lists |
| Games and controllers | Launchers, controller mapping; ThumbDesk's neighbours |

**Outputs, on branch `research/combinator` with a rolling PR, never merged by the task:**
- `docs/combinator/scan/YYYY-MM-DD.md`, the run report:
  - the top 10 new or changed projects, each with licence, health, proposed mode and score;
  - upstream releases and security advisories for projects already combined;
  - three "Rewrite light" candidates, each with the slice to build, what it replaces and its agent hooks.
- `docs/combinator/CATALOG.md`, one ranked, de-duplicated table: project, repo, licence, mode, score, status, agent hooks, last seen. Kept under 400 rows; lower-ranked rows move to `ARCHIVE.md`.
- `docs/combinator/CREDITS.json` (generated from the catalogue). The site's Credits Wall and the in-app Credits page read it.

**Who acts on it:** the monthly review (§10) promotes up to three projects into dossiers, and the next wave builds them. Fable passes then polish them like any other feature.

---

## 7. Linking everything into the agentic desktop

A combined capability is "agent-ready" when all of these exist:

1. **Intent**: Command and voice understand it ("grab this area", "clip that and summarise", "install OBS", "start a recording").
2. **Control**: an entry in the control catalogue (`src/control/catalogue.json`) with its settings, through the one settings writer.
3. **MCP tool**: exposed via Lens's MCP server with a capability grant, so Claude (or any MCP client) can call it.
4. **Magic entry**: it appears in Magic and in the Lens › right-click menu where it makes sense.
5. **Visible action**: when the agent uses it, the Lens cloud pointer shows it happening (presence), and the result has Undo.
6. **Approval**: anything that sends, deletes, pays, installs or signs in stops on the one approval card.
7. **Learns as you go** (planned, M6 `magic.learn`): opt-in, on-device suggestions such as "you always snip then open Notes; make that one step?"

The combinator gets stronger as it grows: each new capability gives the agent another verb, and Magic, voice and Command pick it up for free.

---

## 8. Horizons

| Horizon | When (target) | Goal | Milestones | Measure |
|---|---|---|---|---|
| **H0: Foundations** | now – Dec 2026 | The machinery exists | This plan; the scan running; catalogue seeded from Lens Apps and existing integrations; Credits page in About; Credits Wall on the site; THIRD_PARTY_NOTICES audit | Catalogue ≥ 150 rows; every existing integration credited |
| **H1: Lens 1.0 "One desktop"** | Jan – Feb 2027 | The core combinator is real and signed | Signed releases (DIST-1); Lens Apps with screenshots and credits; light rewrites of clipboard, snip, launcher, widgets, music shipped and agent-ready; first five "Rebuilt in Lens" posts | MASTERPLAN 1.0 targets; 20 combined capabilities agent-ready |
| **H2: The combinator** | Mar – Jun 2027 | Lens is where open source meets | Bridges for local AI, voice, OCR, recording; widget and theme galleries with creator credit; maintainer program; supporter tier with upstream share (if decided); Linux layer-shell exploration | 50 combined capabilities; 10 maintainer partners; 10k stars (stretch) |
| **H3: The favourite** | H2 2027 → | The default open-source desktop people recommend | Cross-platform Lens (Wayland/Hyprland/KDE first); shareable desktops; "learns as you go" on device; community-built combined capabilities through a reviewed plugin path | Recommended in r/desktops and r/unixporn roundups; community PRs > first-party PRs |

Dates are targets, not promises. The weekly and monthly reviews move them openly.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Upstream projects see Lens as taking credit or users | Credit first (rule 3), Link before Rewrite (rule 1), maintainer program, upstream contributions, no implied endorsement |
| Licence mistakes in a fast-moving codebase | §5 table; clean-room record per dossier; a CI check that new dependencies have an allowed licence (**to build**, H0) |
| Scope explosion ("combine everything") | Score threshold; at most three new projects a month; every rewrite stays light with a hand-off |
| A combined feature weakens trust (privacy, stability) | Same promises, flags, approvals, Remove all and test rigs as first-party features; privacy review |
| Bloat breaks the "light" promise | Perf budgets per surface; idle cost ~0 for unused combined features; lazy windows |
| Burnout | Agents do the volume; Campton makes decisions; the release train and reviews have fixed rhythms (MASTERPLAN §5) |

---

## 10. Cadence

| When | What | Who |
|---|---|---|
| Mon and Thu, early morning | Open-source combinator scan (§6) updates the catalogue PR | Scheduled task |
| Daily | Research lookout and tester notes (existing) | Scheduled task |
| Weekly (Monday review, MASTERPLAN §7) | Glance at the catalogue PR's new top 10; flag anything urgent (security advisory on a combined project) | Campton |
| Monthly | Combinator review: promote at most 3 projects to dossiers, retire stale rows, update Credits, pick the month's "Rebuilt in Lens" stories | Campton + agents |
| Per wave | Build the promoted dossiers; Fable pass; credit and post | Agents; Campton merges |

## Open decisions

- Adopt "The open-source desktop where the best of open source finally works as one." as the site hero.
- Use "Lens Desktop" as a descriptor (product name stays "Lens").
- Tribe Code: one-line description, and whether or how it integrates with Lens (e.g. as a Bridge or Link in Lens Apps).
- Move the repo to a Campton GitHub organisation.
- The upstream share of supporter income: mechanism and percentage.
- Which projection ideas (§3.3) to run first.
