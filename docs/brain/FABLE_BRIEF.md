# Fable pass brief (the standing contract)

Every deep Fable pass reads this first, follows it exactly, and is reviewed against it. It replaces ad-hoc prompts: an area prompt says *which* area and *which* bug-id range, and this page says *how*. If this page and an area prompt disagree, this page wins. Then raise the conflict in the PR.

| | |
|---|---|
| Owner | Campton; Claude keeps it current after each pass |
| Model | Claude Fable 5.2 (`claude-fable-5-2`), one agent per area, file-disjoint |
| Replaces | [FABLE_NEXT.md](FABLE_NEXT.md) (22 Nov plan, kept for history) |
| Last revised | 26 November 2026 |

---

## 1. Read first, in this order (≈ 20 minutes; don't skip)

1. [IDENTITY.md](IDENTITY.md): the mission, the eight promises, naming (Lens, made by Campton), the look, the copy voice. **It wins every conflict.**
2. [`DESIGN.md`](../../DESIGN.md) in full, especially **§5 Motion & Feel**: light to look at, weighty to touch; the three press weights; flows from origin; reduced motion; how it's enforced.
3. [`AGENTS.md`](../../AGENTS.md): binding safety rules.
4. [COMBINATOR.md](COMBINATOR.md) §2 and §5: combinator rules and **licence rules** (MIT codebase; never copy GPL/AGPL code; credit everything).
5. [MODULES.md](MODULES.md) §3–§5: kernel, modules and contracts. **New code must not add cross-module imports.** Use a module's `contract.ts` / `api.rs`, events, or the capability registry. Settings go in the module's own section.
6. [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [BUGS.md](BUGS.md) (your area's open rows), [FEATURES.md](FEATURES.md).
7. Your area's dossier in [`docs/features/`](../features/) and its "what is left" ranking in `docs/features/README.md`.
8. Ideas for your area: `docs/research/IDEAS_BACKLOG.md` (branch `research/daily`), the latest `docs/combinator/scan/*` (branch `research/combinator`) and [`docs/research/SOURCES.md`](../research/SOURCES.md). Use them to choose the big win (§3.4).
9. `CHANGELOG.md` (Unreleased) and the open PRs (`gh api repos/orionopenwow/LensUI/pulls`). Know what's in flight, and don't touch files another open PR is changing unless your area prompt says to.

## 2. Project-wide standards (the bar every change meets)

**Promises (IDENTITY §1):**
- free, local-first, reversible (registered with Remove all), off by default;
- approval for anything that sends, submits, books, pays, deletes or signs in;
- games and anti-cheat untouched, no dark patterns, honest copy ("not yet confirmed on a real PC" said out loud).

**Look (IDENTITY §3, DESIGN §1–4):**
- matte Obsidian monochrome chrome, with colour only where it's earned;
- full-colour app icons;
- one rainbow moment (the Lens cloud);
- no glassmorphism, no `backdrop-filter` in new code, no blur on large layers;
- no native `title=` tooltips;
- sentence case;
- tabular numbers where values change.

**Feel (DESIGN §5):**
- every interactive element has a press weight (light, medium, heavy) through the UI-kit primitives (`src/ui/press`, once PR `feature/feel-system` merges; until then `data-weight` plus the motion tokens);
- presses are seen within a frame, held ≥ 90 ms, sink and spring back;
- hover never scales;
- things open from their trigger and return to it;
- segmented and tab indicators slide;
- lists stagger (first 6);
- content swaps are directional;
- everything is interruptible and animates transform and opacity only;
- reduced motion keeps feedback;
- `bun run lint:motion` must not get worse.

**Themes:**
- every surface is readable in every pack, light and dark (contrast audit ≥ 4.5:1 text, ≥ 3:1 icons/accent);
- no hard-coded colours outside theme packs;
- switching theme never moves or resizes anything (theme-switch rig 30/30).

**One of everything (IDENTITY §6):** one settings writer, one change registry, one approval card, one input service, one clipboard history, one motion system, one failsafe. Never add a second.

**Robustness:**
- one owner of each piece of state;
- reconcile with the real window;
- timeouts and fallbacks;
- user-action errors surface (toast or inline), never `.catch(() => {})`;
- background calls use `quiet` with a reason.

**Accessibility:** keyboard-complete; visible focus on keyboard; names on every control; announcements where state changes; hit targets ≥ 32 px.

**Performance:** budgets in `tools/perf`; nothing ticks or renders while hidden; no new timers per item; lazy windows.

**Copy:** plain, short, honest; say what happens and what it changes; no "Oops", no exclamation marks.

## 3. What a pass delivers (every area, in this order)

1. **Bugs.** Every open BUGS.md row in your area: reproduce → root cause → fix → test that fails before and passes after. Log new bugs in your id range only. Move fixed rows to Fixed with the fix and test named.
2. **Quick wins.** The dossier's quick-win list (≤ 30 min each): do them all unless one is wrong; say why if you skip it.
3. **Polish to the bar.**
   - Bring the whole area up to §2: feel (press weights, flows), theme and contrast, a11y, copy, errors, perf.
   - Split any hotspot file you touch past ~800 lines along module seams.
4. **One big win.** One feature that makes this area stand out against the best in its class: Raycast, Arc/Ardia, Cider, macOS widgets, PopClip, whatever leads that space.
   - Choose it from the research backlog, combinator scan or dossier ideas, or propose your own, and say why in the PR.
   - It must be complete, tested, documented, and off by default if it changes Windows or sends data.
   - It must fit the module seams: no new cross-module imports.
   - It must stay inside your files.
5. **UX/UI flourishes (3–5).** Small, delightful touches consistent with DESIGN §5. Examples:
   - a pin that drops in with weight;
   - a count that rolls;
   - an empty state with personality in Lens's voice;
   - a drag that leaves a soft trail;
   - an undo toast that slides back into its origin.

   Each must be tasteful, quick (≤ `--lens-dur-slow`), skippable with reduced motion and covered by a parity scene.
6. **Dossier and docs.**
   - Update your dossier's status lines (works / partly / broken / not built, "(harness)" when not seen on a real PC) and its ranked "what is left".
   - Update BUGS.md, `docs/features/README.md`, CHANGELOG (Unreleased) and the guide index.
   - Update the brain refresh if inventories changed.
7. **Real-PC checklist.** A short list for Campton, highest risk first, each item with what to do and what should happen. Mission Control reads it from the PR body under the heading `## Needs a real PC`.

## 4. Engineering workflow (exact)

**Branch and worktree:**
- Your own branch and worktree off the latest `origin/main`: `fable/<area>-<yyyymmdd>`.
- If node_modules is missing and the network is off, symlink it from an existing worktree.

**Generated files, after touching commands or settings:**
- `python3 tools/gen-types/gen_types.py`
- `node tools/guide/build-index.mjs`
- `node tools/brain/refresh.mjs` when inventories change.
- The control catalogue is regenerated by the Rust test `control::tests::export_catalogue`. When cargo can't run locally, take it from the CI log with `/home/claude/catalogue-from-log.py <log> src/control/catalogue.json`.

**Goldens:** when a visual change is intended, record them from the CI log with `node tools/visual/from-log.mjs <log> tools/parity/golden`. Look at every changed pair before committing it.

**Checks before every push:**
- `bun test src`
- `bun run lint:motion`
- `python3 tools/gen-types/gen_types.py --check`
- the guide index check
- the theme-switch rig when you touched styles.

**CI:**
- **Must be green:** Windows build (clippy `-D warnings`, cargo tests), frontend tests, E2E, visual parity, fluidity/a11y/soak/hyper, portability, Pages.
- **Known intermittent:** `topbar-hides-idle` and `webview-killed`; re-run once. A failure that repeats on the same PR is yours to investigate.

**PRs:**
- Opened through REST (`gh api repos/orionopenwow/LensUI/pulls -f …`); `gh pr create` is blocked.
- Body sections: Summary, Bugs fixed (ids), Quick wins, Polish, Big win, Flourishes, Tests, `## Needs a real PC`, Not done.
- Commit and PR attribution lines as the session specifies.

**Never:**
- merge;
- force-push;
- delete branches;
- touch the owner's computer or folders;
- weaken a safety rule to make a test pass.

**Unclear product decisions:** write the options in the PR, pick the most reversible one, and mark it **open**.

## 5. Quality gate (self-review before opening the PR)

- [ ] Every changed interactive element has a press weight; opened things grow from their trigger; nothing animates layout.
- [ ] Every surface checked in Obsidian, Alabaster Daylight and one community pack, at both parity widths.
- [ ] Keyboard-only run through the area works, and focus is never lost.
- [ ] No new cross-module imports (boundaries) and no new `.catch(() => {})` on user actions.
- [ ] Off by default where IDENTITY says so; Remove all covers any OS change.
- [ ] Copy reads in IDENTITY's voice; licences and credits are right for anything learned or used.
- [ ] Bug rows, dossier, CHANGELOG and real-PC list are updated; all CI green.

## 6. Final report (to the session)

Give the following:
- PR number, head SHA and CI state;
- bugs fixed (ids);
- quick wins done or skipped;
- the big win and why it was chosen;
- the flourishes;
- tests added;
- `Needs a real PC`;
- what's left (ranked);
- anything that conflicts with another open PR.
