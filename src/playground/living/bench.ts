/**
 * Frame-time benchmark for the Living Themes painters at half of 1080p (960×540), the size the
 * wallpaper renders at on a 1920×1080 screen. Run one painter per process so the JIT sees only
 * that painter (as in the real wallpaper window):
 *
 *     bun src/playground/living/bench.ts living-sky
 */
import { makeFrame } from "./sky";
import { painterById } from "./themes";

export const BENCH_W = 960;
export const BENCH_H = 540;

/** Sunrise, noon, sunset, dusk and night in London on the June solstice: every code path. */
export const BENCH_TIMES = ["2026-06-21T03:50:00Z", "2026-06-21T12:00:00Z", "2026-06-21T20:15:00Z", "2026-06-21T21:05:00Z", "2026-06-21T23:30:00Z"];

/** Returns the 25th-percentile and median frame time (ms) over all bench times. */
export function benchPainter(id: string, runs = 40): { p25: number; median: number; worstTime: string } {
  const p = painterById(id);
  if (!p) throw new Error(`unknown painter ${id}`);
  const all: number[] = [];
  let worst = 0, worstTime = "";
  for (const iso of BENCH_TIMES) {
    const state = p.init(BENCH_W, BENCH_H, 7);
    const px = new Uint32Array(BENCH_W * BENCH_H);
    const f = makeFrame({ date: new Date(iso), latitude: 51.5, longitude: -0.13, t: 30, motion: 1, clouds: true, weather: "rain", view: { x0: 0, x1: 1 } });
    for (let i = 0; i < 8; i++) p.paint(px, BENCH_W, BENCH_H, f, state);
    const ts: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      p.paint(px, BENCH_W, BENCH_H, f, state);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    const med = ts[ts.length >> 1];
    if (med > worst) {
      worst = med;
      worstTime = iso;
    }
    all.push(...ts);
  }
  all.sort((a, b) => a - b);
  return { p25: all[Math.floor(all.length * 0.25)], median: all[all.length >> 1], worstTime };
}

if ((import.meta as unknown as { main?: boolean }).main) {
  const argv = (globalThis as unknown as { process?: { argv: string[] } }).process?.argv ?? [];
  const id = argv[2] ?? "living-sky";
  console.log(JSON.stringify({ id, ...benchPainter(id) }));
}
