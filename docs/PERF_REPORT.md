# Performance report — integration/waves-7-8

Measured in the headless harness (no GPU, software rendering) and by reading the setup code. Real-hardware numbers still need the Tester Hub run.

## Frame times (4× CPU throttle, ms; from `tools/perf/budgets.json`, feature/robustness-tests)

| Scenario | p50 | p95 | Long tasks | First paint | Budget (MASTERPLAN p95 ≤ 16.7) |
|---|---|---|---|---|---|
| Dock hover sweep | 16.7 | 16.7 | 0 | 540 | ✅ |
| Dock magnification | 16.7 | 33.3 | 0 | 524 | ⚠ one dropped frame in 20 |
| Dock search glide | 16.7 | 33.3 | 2 | 520 | ⚠ |
| Command Mini → full | 16.7 | 50 | 0 | – | ⚠ |
| Theme switch | 16.7 | 83.4 | 6 | 644 | ❌ |
| Settings tab switch | 16.7 | 50 | 10 | 724 | ❌ (before page code-splitting) |
| Playground sand / flow / starfield / constellation | 16.7 | ≤16.8 | 0 | ~560–610 | ✅ |
| Playground rain | 16.7 | 33.3 | 0 | 652 | ⚠ |
| Playground aurora | 66.6 | 66.7 | 81 | 588 | ❌ (software rendering; GPU path untested) |

## Bundle (esbuild, unminified, gzip in brackets)

| Chunk | Before | After |
|---|---|---|
| Settings (`ControlCenterSurface`) | 812 KB [157 KB] | **415 KB** — pages now load on first visit |
| `main.js` (shared) | 643 KB [109 KB] | unchanged |
| Guide index | 421 KB [105 KB] | lazy; only when the Guide opens |
| Dock | 156 KB [30 KB] | +voice, music mini (small) |
| Total, all surfaces | 5.1 MB [1.0 MB] | 101 files |

## Idle work with everything at its defaults

| What | Before | After |
|---|---|---|
| Playground idle monitor | read the wallpaper settings file from disk every second, forever | cached; re-read at most every 10 s |
| Voice Dock tick | 10 Hz timer in the Dock forever | ticks only while the Dock is morphed |
| Top Bar media poll | every 2 s, even with Lens Music on or the bar hidden | stops while Music is on or the window is hidden |
| Cursor FX worker | 2 Hz bookkeeping loop, no hooks while off | unchanged (cheap); could park on a condvar |
| Running-windows polls | Dock 0.9 s, palette/launcher 1.5 s, overview 1 s, Settings 1.4 s — skipped when `windows-changed` pushes arrive within 5 s | unchanged |
| Approvals pill | 15 s poll + `mcp-changed` event | unchanged |
| Settings pages | polls only while visible (Wi-Fi/Bluetooth 15 s, battery 30 s, audio 5 s, privacy 10 s) | unchanged |
| Threads spawned in Rust (all modules) | 71 `thread::spawn` sites; hooks install only when their feature is on | — |

Not measured here (needs Windows): binary size, idle RAM/CPU per process, cold start. The robustness branch's Windows E2E job measures start/quit loops.

## Top 10 fixes

1. Settings pages code-split (**done**).
2. Idle-monitor disk read every second (**done**).
3. Voice Dock 10 Hz timer at idle (**done**).
4. Top Bar media poll when Music is on (**done**).
5. Theme switch p95 83 ms: batch the CSS variable writes in one `requestAnimationFrame` and avoid re-rendering every surface's React tree on a token change.
6. Settings tab switch long tasks: keep the six still-inline pages lazy too (move them into `src/settings/pages/`).
7. Aurora scene: lower internal resolution or cap at 30 fps on the software path; measure on a GPU first.
8. `main.js` 643 KB: lucide icons are imported by name across surfaces; check tree-shaking in the Vite build and split rarely used surfaces' deps.
9. Replace the running-windows polls with the push event only (keep one slow safety poll).
10. Park the cursor-FX worker on a condition variable while every effect is off.
