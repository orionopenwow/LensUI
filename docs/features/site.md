# Website (docs/site) — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`). Sources: `tools/site/*`, `docs/site/*`,
`.github/workflows/pages.yml`. **A site redo is in flight** on `site/redo-dock-first` (not on the
remote at the time of writing); its points are listed in §6/§8 and this dossier should be
re-checked once it lands.

## 1. Rundown

**What it is.** Lens's public site on GitHub Pages: a home page that shows the real app (live
exhibits built from the app's own surfaces), download page, how-to docs generated from the repo's
Markdown with search, a Guide index, a "Today's test plan" page for testers, and a 404.

**Who it's for.** People deciding whether to try Lens; testers; contributors.

**Where it lives.**

| Part | Paths |
|---|---|
| Build | `tools/site/build.mjs` (pages, docs, data JSON), `pages.mjs` (home sections), `content/{features,thumbdesk}.mjs`, `lib/{layout,icons,logo,markdown,packs}.mjs`, `brand.mjs`, `brand-icons.py` |
| Live exhibits | `tools/site/live/{build-live.mjs,site-core.ts,app-core.ts,app-window.ts,dock-entry.tsx,playground-entry.ts,themes-entry.ts,surfaces/}` |
| Media | `fetch-app-media.mjs` (Lens Apps media from pinned commits), `shoot-surfaces.mjs`, `docs/site/assets/*.webp` |
| Generated docs | `gen-user-docs.mjs`, `gen-readme.mjs` |
| Runtime JS/CSS | `docs/site/js/{site,home,desk,exhibits,showcases,themelab,guide,docs-search,logo}.js`, `docs/site/css/site.css` |
| Checks | `tools/site/check.mjs` (errors, links, a11y + axe, contrast, weight budgets, screenshots 375/768/1440 × light/dark, animated-logo frame cost, desk drag) |
| Deploy | `.github/workflows/pages.yml` |

## 2. Feature tree
- **Home** — works: hero with animated logo (poster first, still with reduced motion, ≤ 4 ms/frame
  budget); sections `f-browser`, `f-magic`, `themes`, `byo`, `overlays`, `apps`, `more`, `trust`,
  `platforms`, `releases`, `works-on`; ThumbDesk "Run the desktop from the couch" + first tile in
  More picks.
- **Demo desk** (`desk.js`) — works: a draggable mini desktop with the real Dock; drag check passes
  after #106 removed the glow blur that broke hit-testing.
- **Live exhibits** (`exhibits.js`, `build-live.mjs`) — works: the app's real surfaces as lazy
  chunks (Dock, playground, theme lab), so the site can't drift from the app.
- **Theme lab** (`themelab.js`) — works: packs from `lib/packs.mjs`.
- **Showcases** (`showcases.js`) — works: screenshots per pack (`desktop-*.webp`).
- **Apps grid** — works: real icons/screens from the catalogue's pinned commits; text-only if media
  fetch fails at build.
- **Download page** — works: Windows 10/11, macOS/Linux status, releases.
- **Docs** — works: generated how-tos and developer references with source links; `docs-search.js`
  over `data/docs-index.json`.
- **Guide index** — works: `data/guide-index.json` (features + site + docs).
- **Test page** — works: "Today's test plan" from the latest tester plan.
- **Budgets** (`check.mjs:141-142`) — works: first load ≤ 1.2 MB, everything loaded ≤ 2.2 MB per
  page (header comment still says 1.5 MB — stale).
- **Not built:** localisation; per-page OG images; changelog page from releases; a status/known
  issues page fed from BUGS.md.

## 3. Quick wins (≤ 1 day, ranked)
1. **Fix the stale budget comment** in `check.mjs:7` (says 1.5 MB, code enforces 1.2/2.2 MB).
2. **Oversized-icon check** in `check.mjs`: fail when a rendered icon's natural size is > 2× its
   box (owner asked for this in the redo).
3. **Known issues page** generated from `docs/brain/BUGS.md` open rows (plain titles only).
4. **Toasts/console for 5 swallowed errors** in site JS/live code — they hide exhibit load failures.
5. **OG image per page** from the existing showcase shots.

## 4. Polish assessment
- **Owner's redo points** (in flight): Dock first; 3-step slow loops instead of fast montages; drop
  the "asks first" motto; a multi-step approval example; apps grid with more breathing room and
  matte icons; smaller showcase images; oversized icons check.
- **Motion:** respect reduced motion everywhere (logo does; check exhibits and loops).
- **Copy:** align with the app's plain-English tone; remove internal jargon in developer references
  shown to visitors (they're labelled "work in progress" — good).
- **A11y:** axe + manual contrast checks exist; add keyboard path through the demo desk.
- **Perf:** budgets hold; showcase webp sizes are the main weight — smaller images per the redo.

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| fixed | — | desk drag | glow blur broke hit-testing (#106) |
| Suspected S1 | Low | `check.mjs:7` | stale budget comment (1.5 MB vs enforced 1.2/2.2 MB) |
| Suspected S2 | Low | `build.mjs:64` | app media fetch failure only warns; a deploy can ship a text-only apps grid silently — make CI fail on main |
| Suspected S3 | Low | live exhibits | an exhibit chunk that fails to load leaves an empty frame (5 swallowed errors) |
| Suspected S4 | Low | redo branch | redo not pushed to the remote; risk of drift from main's section ids (`f-browser`, `f-magic` used by Guide links) |

## 6. One idea to push to main
**Dock-first hero with a slow three-step loop** (from the owner's redo list): the real Dock exhibit
as the first thing on the page, looping "hover → open → Lens ›" at a calm pace, with a multi-step
approval example as step 3. Land it via the redo branch, keeping the Guide anchor ids stable.

## 7. Test plan
**Build:** `node tools/site/build.mjs` then `node tools/site/check.mjs` in CI (exists) — add
oversized-icon check and fail-on-missing-media for main.
**Unit:** `lib/markdown.mjs` (escaping, headings, code), `pages.mjs` section ids stable (snapshot of
ids used by `guide-index.json`).
**Browser checks:** every page × light/dark × 375/768/1440; axe clean; contrast AA; budgets; logo
frame cost; desk drag; exhibits load within 3 s on 4× throttle.
**Manual:** Safari/Firefox exhibits; keyboard through home and desk; reduced motion; slow 3G
first paint; Download links resolve to the latest release.

## 8. Suggested overhaul
- **Phase 1:** stale comment; oversized-icon check; media-fail gate; swallowed errors.
- **Phase 2 (redo):** Dock first, slow loops, approval example, apps grid spacing + matte icons,
  smaller showcase images; keep section ids.
- **Phase 3:** known-issues and changelog pages generated from repo data; OG images.
- **Risks:** weight budgets with more live exhibits; anchors used by in-app Guide links.

## 9. Fable pass brief
```
Feature: Website. Code: tools/site/*, docs/site/*, .github/workflows/pages.yml.
Do:
1. Fix check.mjs header comment (1.2 MB first load / 2.2 MB total).
2. Add oversized-icon check (natural size > 2× box fails).
3. Fail the build on main when app media fetch fails.
4. Surface exhibit load failures (5 swallowed errors).
5. Coordinate with site/redo-dock-first: Dock first, slow 3-step loops, approval example,
   apps grid spacing + matte icons, smaller showcase images; keep section ids.
Check: node tools/site/build.mjs && node tools/site/check.mjs.
Don't: break Guide anchors (f-browser, f-magic, apps…); exceed budgets; load remote media at runtime.
```
