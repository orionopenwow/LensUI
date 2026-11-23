// Smoothness probe, page side (docs/SMOOTHNESS.md, R1). Installed in every surface by main.tsx and
// idle until Tester Hub starts a session: then it records requestAnimationFrame times, long
// animation frames and layout shifts and sends them to the backend once a second. It also performs
// the scripted interactions aimed at this surface (hover, click, key) so a check can run itself.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { performAct, type DomAct } from "./act";

interface ProbeEvent {
  on: boolean;
  session?: string;
}

export function installSmoothProbe(surface: string): void {
  let on = false;
  let raf = 0;
  let timer = 0;
  let offset = 0;
  let frames: number[] = [];
  let loaf: { at: number; dur: number; blocking: number }[] = [];
  let shifts: { at: number; value: number }[] = [];
  let observers: PerformanceObserver[] = [];
  const epoch = () => performance.timeOrigin + performance.now();
  const round = (n: number) => Math.round(n * 10) / 10;

  const flush = () => {
    if (!frames.length && !loaf.length && !shifts.length) return;
    const chunk = { surface, offset, frames, loaf, shifts };
    frames = [];
    loaf = [];
    shifts = [];
    invoke("smooth_submit_cmd", { chunk }).catch(() => {});
  };
  const tick = () => {
    frames.push(round(epoch()));
    if (frames.length > 2000) flush();
    raf = requestAnimationFrame(tick);
  };
  const observe = (type: string, onEntry: (e: PerformanceEntry) => void) => {
    try {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
      const po = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
      po.observe({ type, buffered: false });
      observers.push(po);
    } catch {
      /* this WebView2 build has no such entry type: frame gaps still tell the story */
    }
  };
  const start = async () => {
    if (on) return;
    on = true;
    // Line this page's clock up with the backend's (they differ by the page's load-time skew).
    try {
      const t0 = epoch();
      const s = await invoke<{ nowMs: number } | null>("smooth_active_cmd");
      const t1 = epoch();
      if (s) offset = Math.round(s.nowMs - (t0 + t1) / 2);
    } catch {
      offset = 0;
    }
    if (!on) return;
    raf = requestAnimationFrame(tick);
    timer = window.setInterval(flush, 1000);
    observe("long-animation-frame", (e) => {
      const b = (e as PerformanceEntry & { blockingDuration?: number }).blockingDuration ?? 0;
      loaf.push({ at: round(performance.timeOrigin + e.startTime), dur: round(e.duration), blocking: round(b) });
    });
    observe("layout-shift", (e) => {
      const ls = e as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (!ls.hadRecentInput && ls.value) shifts.push({ at: round(performance.timeOrigin + e.startTime), value: ls.value });
    });
  };
  const stop = () => {
    if (!on) return;
    on = false;
    cancelAnimationFrame(raf);
    window.clearInterval(timer);
    observers.forEach((o) => o.disconnect());
    observers = [];
    flush();
  };

  listen<ProbeEvent>("lens://smooth-probe", (e) => (e.payload?.on ? void start() : stop())).catch(() => {});
  listen("lens://smooth-flush", () => on && flush()).catch(() => {});
  listen<DomAct>("lens://smooth-act", (e) => {
    if (on && e.payload?.surface === surface) performAct(e.payload);
  }).catch(() => {});
  // A window built in the middle of a session joins it.
  invoke<{ session: string } | null>("smooth_active_cmd")
    .then((s) => {
      if (s) void start();
    })
    .catch(() => {});
}
