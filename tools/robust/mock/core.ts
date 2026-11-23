// Chaos wrapper around the parity mock (tools/parity/mock/core.ts), used by the robustness suites
// (docs/TESTING.md). Everything is forwarded unchanged unless the page URL asks for chaos:
//   ?chaos=0.05   → 5 % of backend calls fail: half reject at once, half "time out" after 1.5 s
//   ?seed=42      → deterministic failure pattern
// Failures are recorded on window.__lensChaos so the suite can report which commands it broke.
import * as real from "../../parity/mock/core";

export const calls = real.calls;
export const convertFileSrc = real.convertFileSrc;
export const isTauri = real.isTauri;

const params = new URLSearchParams(location.search);
const rate = Math.min(Math.max(Number(params.get("chaos") || 0), 0), 1);
// Scramble the seed (splitmix-style) so small seeds don't start with a run of tiny numbers that
// would always fail the very first calls.
let seed = (Math.imul((Number(params.get("seed") || 1) >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
function rand(): number {
  // xorshift32: repeatable across runs and browsers.
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 0x100000000;
}

// Commands whose failure would only break the harness itself, not the app's error handling.
const NEVER_FAIL = new Set(["get_config", "surface_ready_cmd"]);
const W = globalThis as any;
for (let i = 0; i < 16; i++) rand();
W.__lensChaos = { rate, failed: [] as string[], timedOut: [] as string[] };

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (rate > 0 && !NEVER_FAIL.has(cmd)) {
    const r = rand();
    if (r < rate / 2) {
      W.__lensChaos.failed.push(cmd);
      throw new Error(`chaos: ${cmd} failed`);
    }
    if (r < rate) {
      W.__lensChaos.timedOut.push(cmd);
      await new Promise((res) => setTimeout(res, 1500));
      throw new Error(`chaos: ${cmd} timed out`);
    }
  }
  const result = await real.invoke<T>(cmd, args);
  // ?scene=<id>: show a Playground scene as the wallpaper (tools/perf, tools/visual).
  const scene = params.get("scene");
  if (scene && cmd === "get_wallpaper_state_cmd" && result) {
    const r = result as any;
    return { ...r, settings: { ...r.settings, enabled: true, scene, playgroundCalm: false } } as T;
  }
  return result;
}
