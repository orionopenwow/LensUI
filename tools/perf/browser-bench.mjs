// Lens Browser benchmarks (MASTERPLAN PERF-1, browser): a reproducible scenario set that runs inside
// the real-Windows E2E job (tests/e2e/run.mjs, scenario "browser-bench") against the running app.
// Method and published numbers: docs/BENCHMARKS.md.
//
//   cold-open      browser_open on a fresh profile → the frame UI has painted (.lb-root rendered),
//                  then → the first tab's page reports document.readyState "complete"
//   ram-1-tab      working set of Lens Browser's WebView2 processes (command line under
//                  LensUI\browser\profiles) with one live tab on a small local page
//   ram-10-asleep  the same after opening 10 tabs and putting 9 to sleep
//   tab-switch     browser_tab_activate between two live tabs, 20 times: round trip until the
//                  backend has moved the pages (median, p95)
//
// Pages come from a local HTTP server on 127.0.0.1 started here, so the network never enters the
// numbers. Each measurement repeats (REPEAT, default 5) where it can; medians are reported.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";

const REPEAT = Number(process.env.BENCH_REPEAT || 5);

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const p95 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] : null;
};

/** A small, fixed page (about 6 KB of text, a few links): the same bytes every run. */
export function benchPage(n) {
  const para = "The harbour came alive at dawn; boats rose on the tide while gulls argued over the nets. ";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bench page ${n}</title></head><body><h1>Bench page ${n}</h1>${Array.from({ length: 12 }, (_, i) => `<p>${para.repeat(5)}</p><a href="/p${i}">Link ${i}</a>`).join("")}</body></html>`;
}

export function startPages() {
  const server = createServer((req, res) => {
    const n = Number((/\/p(\d+)/.exec(req.url) || [])[1] || 0);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(benchPage(n));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

/** Working set (MB) of Lens Browser's WebView2 processes; Lens's own windows use another folder. */
export function browserRamMb() {
  const ps = "$t=0; Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.CommandLine -match 'LensUI\\\\browser\\\\profiles' } | ForEach-Object { $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { $t += $p.WorkingSet64 } }; [math]::Round($t/1MB,1)";
  try {
    return Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
  } catch {
    return null;
  }
}

/**
 * Runs the set. `h` gives the harness: { invoke(page, cmd, args), dock, waitForSurface(name, ms), sleep(ms) }.
 * Returns { runner, results: [{ id, unit, values, median, p95 }] }.
 */
export async function browserBench(h) {
  const { invoke, dock, sleep } = h;
  const pages = await startPages();
  const results = [];
  const add = (id, unit, values, note = "") => results.push({ id, unit, values, median: median(values), p95: p95(values), note });
  try {
    // ---- cold open: the first browser_open after Lens started (the frame window is created) ----
    const t0 = performance.now();
    await invoke(dock, "browser_open", { url: `${pages.base}/p0` });
    const br = await h.waitForSurface("browser", 30000);
    await br.waitForSelector(".lb-root", { timeout: 20000 });
    const framePaint = performance.now() - t0;
    let firstLoad = null;
    for (let i = 0; i < 200; i++) {
      const st = await invoke(br, "browser_page", { op: "status" }).catch(() => null);
      if (st && st.ready === "complete") { firstLoad = performance.now() - t0; break; }
      await sleep(50);
    }
    add("cold-open-frame-ms", "ms", [Math.round(framePaint)], "one sample: only the first open is cold");
    if (firstLoad !== null) add("cold-open-first-page-ms", "ms", [Math.round(firstLoad)], "one sample");
    // Close any setup or start page so the page shows.
    await invoke(br, "browser_settings_set", { settings: { ...(await invoke(br, "browser_state")).state.settings, setupSeen: true } }).catch(() => {});
    await sleep(1500);

    // ---- RAM with one live tab ----
    const ram1 = [];
    for (let i = 0; i < REPEAT; i++) { ram1.push(browserRamMb()); await sleep(600); }
    add("ram-1-tab-mb", "MB", ram1.filter((x) => x !== null));

    // ---- 10 tabs, 9 asleep ----
    for (let i = 1; i < 10; i++) await invoke(br, "browser_navigate", { input: `${pages.base}/p${i}`, newTab: true });
    await sleep(2500);
    const view = await invoke(br, "browser_state");
    const ids = view.state.tabs.map((t) => t.id);
    const active = view.state.activeTab;
    for (const id of ids) if (id !== active) await invoke(br, "browser_tab_sleep", { id }).catch(() => {});
    await sleep(2500);
    const ram10 = [];
    for (let i = 0; i < REPEAT; i++) { ram10.push(browserRamMb()); await sleep(600); }
    add("ram-10-tabs-9-asleep-mb", "MB", ram10.filter((x) => x !== null));

    // ---- tab switch between two live tabs ----
    const [a, b] = [active, ids.find((x) => x !== active)];
    await invoke(br, "browser_tab_activate", { id: b });
    await sleep(1500);
    const sw = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      await invoke(br, "browser_tab_activate", { id: i % 2 ? b : a });
      sw.push(Math.round((performance.now() - t) * 10) / 10);
      await sleep(150);
    }
    add("tab-switch-ms", "ms", sw, "two live tabs, backend round trip incl. moving the pages");
  } finally {
    pages.close();
  }
  return { runner: process.env.RUNNER_NAME ? `${process.env.RUNNER_OS} ${process.env.RUNNER_ARCH} (${process.env.ImageOS || "github"})` : "local", build: "debug (E2E build)", results };
}
