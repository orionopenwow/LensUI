// "Theme follows music": crossfades this window's Lens accent towards the artwork colour while
// music plays, and back to the user's own accent after playback stops. It never saves config:
// the override lives only in the running windows, so quitting Lens or turning the option off
// restores everything. Mount <MusicAccentBridge/> once per surface (docs/MUSIC.md §Snippets).
import { useEffect, useRef } from "react";
import { hexToRgb, mix, musicAccent, pickVivid, rgbToHex, type NowPlaying } from "./model";
import { samplePalette } from "./art";

/** Minimum time between two accent changes (track skipping shouldn't strobe the desktop). */
export const MIN_GAP_MS = 4000;

export interface AccentPlan {
  /** Colour to fade to, or null to leave the accent alone. */
  target: string | null;
  /** True when the user's own accent should come back. */
  restore: boolean;
}

/**
 * Decides what the accent should do. Pure so it can be unit-tested.
 * `stoppedForMs` is how long nothing has been playing (0 while playing).
 */
export function planAccent(opts: {
  enabled: boolean;
  suppressed: boolean;
  playing: boolean;
  stoppedForMs: number;
  restoreDelayMs: number;
  current: string | null;
  candidate: string | null;
  lastChangeMs: number;
  nowMs: number;
}): AccentPlan {
  const { enabled, suppressed, playing, stoppedForMs, restoreDelayMs, current, candidate, lastChangeMs, nowMs } = opts;
  if (!enabled || suppressed) return { target: null, restore: current !== null };
  if (!playing) return stoppedForMs >= restoreDelayMs && current !== null ? { target: null, restore: true } : { target: null, restore: false };
  if (!candidate || candidate === current) return { target: null, restore: false };
  if (current !== null && nowMs - lastChangeMs < MIN_GAP_MS) return { target: null, restore: false };
  return { target: candidate, restore: false };
}

function fade(from: string, to: string, ms: number, apply: (hex: string) => void, reduced: boolean): () => void {
  const a = hexToRgb(from), b = hexToRgb(to);
  if (!a || !b || reduced || ms <= 0) {
    apply(to);
    return () => {};
  }
  const t0 = performance.now();
  let raf = 0;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    apply(rgbToHex(mix(a, b, e)));
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Applies the plan to this window's root `--lens-accent` (inline override only). */
export function MusicAccentBridge(props: {
  now: NowPlaying | null;
  enabled: boolean;
  intensity: number;
  restoreDelayS: number;
  /** Fullscreen app or game in front: never recolour then. */
  suppressed?: boolean;
}) {
  const { now, enabled, intensity, restoreDelayS, suppressed = false } = props;
  const state = useRef({ current: null as string | null, original: "", lastChange: 0, stoppedAt: 0, cancel: () => {} });
  useEffect(() => {
    const root = document.documentElement;
    const s = state.current;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const playing = now?.status === "playing";
    if (playing) s.stoppedAt = 0;
    else if (!s.stoppedAt) s.stoppedAt = Date.now();
    const userAccent = () => s.original || getComputedStyle(root).getPropertyValue("--lens-accent").trim() || "#fafafa";
    const base = getComputedStyle(root).getPropertyValue("--lens-pack-base").trim() || "#09090b";
    let cancelled = false;
    const run = async () => {
      const pal = now?.artwork && playing ? await samplePalette(now.artwork) : [];
      if (cancelled) return;
      const candidate = pal.length ? musicAccent(pickVivid(pal), userAccent(), base.startsWith("#") ? base : "#09090b", intensity) : null;
      const plan = planAccent({
        enabled,
        suppressed,
        playing,
        stoppedForMs: s.stoppedAt ? Date.now() - s.stoppedAt : 0,
        restoreDelayMs: restoreDelayS * 1000,
        current: s.current,
        candidate,
        lastChangeMs: s.lastChange,
        nowMs: Date.now(),
      });
      if (plan.target) {
        if (s.current === null) s.original = getComputedStyle(root).getPropertyValue("--lens-accent").trim();
        s.cancel();
        s.cancel = fade(s.current ?? userAccent(), plan.target, 900, (hex) => root.style.setProperty("--lens-accent", hex), reduced);
        s.current = plan.target;
        s.lastChange = Date.now();
      } else if (plan.restore && s.current) {
        s.cancel();
        const back = s.original;
        s.cancel = fade(s.current, back || userAccent(), 900, (hex) => root.style.setProperty("--lens-accent", hex), reduced);
        s.current = null;
        window.setTimeout(() => s.current === null && root.style.removeProperty("--lens-accent"), reduced ? 0 : 950);
      }
    };
    run();
    // Re-check after the restore delay so the accent comes back even with no new events.
    const t = !playing && s.current ? window.setTimeout(run, restoreDelayS * 1000 + 50) : 0;
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, [now?.trackKey, now?.status, now?.artwork, enabled, intensity, restoreDelayS, suppressed]);
  // Leaving the page (window closed, option toggled off) drops the override.
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--lens-accent");
    },
    [],
  );
  return null;
}
