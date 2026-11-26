# Lens Browser benchmarks

What Lens Browser costs in time and memory, measured the same way on every pull request
(MASTERPLAN PERF-1, browser). Learned from Ardia's habit of publishing numbers with their method
and caveats (ideas only; docs/THIRD_PARTY_NOTICES.md).

**Only Lens's own numbers are published here.** We can't install and drive other browsers on
CI's runner with the same script, so there is no comparison table. If you see one elsewhere, it
didn't come from us.

## How it's measured

* **Where:** GitHub Actions `windows-latest` (Windows Server 2025, 4 vCPU, 16 GB RAM, no GPU),
  inside the real-Windows E2E job (`tests/e2e/run.mjs`, scenario `browser-bench`), against the
  running app. Script: `tools/perf/browser-bench.mjs`.
* **Build:** the E2E build is a **debug** build of Lens (`tauri build --debug`). The pages run in
  the system WebView2 runtime, which is the same in debug and release, so memory and page timings
  are representative; Lens's own Rust code is slower in debug, so frame and switch times are
  upper bounds.
* **Pages:** a fixed 6 KB page (`benchPage` in the script) served from 127.0.0.1 by the test, so
  the network never enters the numbers.
* **Memory:** working set of the `msedgewebview2.exe` processes whose command line is under
  `LensUI\browser\profiles` (Lens Browser's own profiles; Lens's other windows are excluded),
  sampled 5 times, median. Working set counts shared pages in each process, so the sum overstates
  what the processes cost together.
* **Repeat:** memory 5 samples, tab switch 20, cold open 1 (only the first open of a session is
  cold). Medians and p95 are reported; the raw values are in the CI log lines `BENCH|…` and in the
  `e2e-windows` artifact (`browser-bench.json`).

| Scenario | What starts and stops the clock |
|---|---|
| Cold open (frame) | `browser_open` sent → the browser frame has rendered (`.lb-root` in the DOM) |
| Cold open (first page) | `browser_open` sent → the first tab reports `document.readyState === "complete"` |
| RAM, 1 tab | one live tab on the bench page |
| RAM, 10 tabs, 9 asleep | after opening 10 tabs and putting 9 to sleep |
| Tab switch | `browser_tab_activate` between two live tabs: round trip until the core has moved the pages |

## Results

RESULTS_PLACEHOLDER

## Caveats

* CI runners are shared virtual machines; timings swing between runs (we've seen ±30 % on other
  Lens timings). Treat single numbers as "about", and compare medians over several runs.
* No GPU on the runner: WebView2 renders in software there, which makes paint slower and memory a
  little different from a typical PC.
* The bench page is small and static. Real sites with heavy scripts cost far more memory per live
  tab; sleeping tabs cost nothing because their webview is closed.
* "Ads and trackers" filtering runs a check on every request on WebView2's UI thread; on this
  page there is almost nothing to block, so its cost is not visible here. A page-load benchmark on
  ad-heavy pages needs the network and is not in the CI set.
* Not yet measured on a real PC; the targets in docs/LENS_BROWSER.md (≤ 180 MB with one tab,
  ≤ 220 MB with 10 tabs and 9 asleep) remain targets until it is.
