// Smoothness analysis (docs/SMOOTHNESS.md, R1). Pure functions: turn what the probe recorded
// (per-surface frame times, long animation frames, layout shifts, native window events and the
// begin/end marks of each scripted interaction) into one row per interaction.

export interface FrameChunk {
  surface: string;
  /** Page-clock → backend-clock offset in ms, measured when the probe switched on. */
  offset: number;
  /** requestAnimationFrame times, page clock, epoch ms. */
  frames: number[];
  loaf: { at: number; dur: number; blocking: number }[];
  shifts: { at: number; value: number }[];
}
export interface NativeEvent {
  atMs: number;
  label: string;
  kind: "show" | "hide" | "resize" | "move" | string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Mark {
  atMs: number;
  id: string;
  phase: "begin" | "end" | string;
}
export interface RawSession {
  session: string;
  startedMs: number;
  native: NativeEvent[];
  chunks: unknown[];
  marks: Mark[];
}

export type Verdict = "smooth" | "rough" | "janky" | "no-data";

export interface InteractionResult {
  id: string;
  label: string;
  /** Surfaces that drew frames during the interaction. */
  surfaces: string[];
  durationMs: number;
  frames: number;
  /** The display's frame time as measured (16.7 at 60 Hz, 6.9 at 144 Hz). */
  frameMs: number;
  droppedPct: number;
  worstMs: number;
  longFrameMs: number;
  cls: number;
  /** Native window moves or resizes while the window was on screen. */
  nativeChanges: { label: string; kind: string; atMs: number }[];
  resizedMidAnimation: boolean;
  verdict: Verdict;
  note?: string;
}
export interface SmoothReport {
  session: string;
  results: InteractionResult[];
  summary: { smooth: number; rough: number; janky: number; noData: number; worstMs: number; droppedPct: number; resized: number; frameMs: number };
}

/** Targets from the robustness plan: under 1% dropped frames, no frame over 33 ms. */
export const TARGET = { droppedPct: 1, worstMs: 33.4, roughDroppedPct: 5, roughWorstMs: 50 } as const;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function isChunk(v: unknown): v is FrameChunk {
  const c = v as FrameChunk;
  return !!c && typeof c.surface === "string" && Array.isArray(c.frames);
}

/** All frame times of each surface on the backend clock, sorted. */
export function framesBySurface(chunks: unknown[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const c of chunks) {
    if (!isChunk(c)) continue;
    const off = Number.isFinite(c.offset) ? c.offset : 0;
    const list = out.get(c.surface) ?? [];
    for (const f of c.frames) if (Number.isFinite(f)) list.push(f + off);
    out.set(c.surface, list);
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

/** The display's frame time: the median gap between frames, ignoring pauses. Clamped to 4–34 ms. */
export function frameInterval(frames: number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i] - frames[i - 1];
    if (d > 0 && d < 50) gaps.push(d);
  }
  const m = median(gaps);
  return m ? Math.min(34, Math.max(4, m)) : 16.7;
}

export interface WindowStats {
  frames: number;
  expected: number;
  dropped: number;
  worstMs: number;
}

/**
 * Frame statistics for one surface inside [from, to]. A gap that spans the window being shown or
 * hidden (the page does not draw while its window is hidden) or longer than half a second is a
 * pause, not a dropped frame.
 */
export function windowStats(frames: number[], frameMs: number, from: number, to: number, pauses: number[] = []): WindowStats {
  const st: WindowStats = { frames: 0, expected: 0, dropped: 0, worstMs: 0 };
  let prev: number | null = null;
  for (const t of frames) {
    if (t < from) continue;
    if (t > to) break;
    st.frames++;
    if (prev !== null) {
      const d = t - prev;
      const p0 = prev;
      const paused = d > 500 || pauses.some((p) => p > p0 && p <= t);
      if (!paused) {
        const slots = Math.max(1, Math.round(d / frameMs));
        st.expected += slots;
        st.dropped += slots - 1;
        if (d > st.worstMs) st.worstMs = d;
      }
    }
    prev = t;
  }
  return st;
}

export function verdictOf(r: Pick<InteractionResult, "frames" | "droppedPct" | "worstMs" | "resizedMidAnimation">): Verdict {
  if (r.frames < 3) return "no-data";
  if (r.droppedPct <= TARGET.droppedPct && r.worstMs <= TARGET.worstMs && !r.resizedMidAnimation) return "smooth";
  if (r.droppedPct <= TARGET.roughDroppedPct && r.worstMs <= TARGET.roughWorstMs) return "rough";
  return "janky";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyze(raw: RawSession, labels: Record<string, string> = {}, notes: Record<string, string> = {}): SmoothReport {
  const bySurface = framesBySurface(raw.chunks);
  const intervals = new Map<string, number>();
  for (const [s, f] of bySurface) intervals.set(s, frameInterval(f));
  const sessionFrameMs = median([...intervals.values()]) || 16.7;
  const chunks = raw.chunks.filter(isChunk);

  const results: InteractionResult[] = [];
  const begins = raw.marks.filter((m) => m.phase === "begin");
  for (const b of begins) {
    const end = raw.marks.find((m) => m.phase === "end" && m.id === b.id && m.atMs >= b.atMs);
    const from = b.atMs;
    const to = end ? end.atMs : b.atMs + 1500;
    const native = raw.native.filter((e) => e.atMs >= from && e.atMs <= to);
    let frames = 0;
    let expected = 0;
    let dropped = 0;
    let worst = 0;
    const surfaces: string[] = [];
    for (const [surface, list] of bySurface) {
      const pauses = native.filter((e) => e.label === surface && (e.kind === "show" || e.kind === "hide")).map((e) => e.atMs);
      const st = windowStats(list, intervals.get(surface) ?? sessionFrameMs, from, to, pauses);
      if (st.frames < 2) continue;
      surfaces.push(surface);
      frames += st.frames;
      expected += st.expected;
      dropped += st.dropped;
      worst = Math.max(worst, st.worstMs);
    }
    let longFrameMs = 0;
    let cls = 0;
    for (const c of chunks) {
      const off = Number.isFinite(c.offset) ? c.offset : 0;
      for (const l of c.loaf ?? []) if (l.at + off >= from && l.at + off <= to) longFrameMs = Math.max(longFrameMs, l.dur);
      for (const s of c.shifts ?? []) if (s.at + off >= from && s.at + off <= to) cls += s.value;
    }
    const nativeChanges = native.filter((e) => e.kind === "resize" || e.kind === "move").map((e) => ({ label: e.label, kind: e.kind, atMs: e.atMs }));
    const base = {
      id: b.id,
      label: labels[b.id] ?? b.id,
      surfaces,
      durationMs: Math.round(to - from),
      frames,
      frameMs: round1(sessionFrameMs),
      droppedPct: expected ? round1((dropped / expected) * 100) : 0,
      worstMs: round1(worst),
      longFrameMs: round1(longFrameMs),
      cls: Math.round(cls * 1000) / 1000,
      nativeChanges,
      resizedMidAnimation: nativeChanges.length > 0,
      note: notes[b.id],
    };
    results.push({ ...base, verdict: verdictOf(base) });
  }

  const measured = results.filter((r) => r.verdict !== "no-data");
  const totalExpected = measured.reduce((n, r) => n + r.frames, 0);
  return {
    session: raw.session,
    results,
    summary: {
      smooth: results.filter((r) => r.verdict === "smooth").length,
      rough: results.filter((r) => r.verdict === "rough").length,
      janky: results.filter((r) => r.verdict === "janky").length,
      noData: results.filter((r) => r.verdict === "no-data").length,
      worstMs: round1(Math.max(0, ...measured.map((r) => r.worstMs))),
      droppedPct: totalExpected ? round1(measured.reduce((n, r) => n + r.droppedPct * r.frames, 0) / totalExpected) : 0,
      resized: results.filter((r) => r.resizedMidAnimation).length,
      frameMs: round1(sessionFrameMs),
    },
  };
}

/** Plain-text table for the clipboard and bug reports. */
export function reportText(r: SmoothReport): string {
  const head = `Lens smoothness check · ${r.session} · display ${r.summary.frameMs} ms/frame (${Math.round(1000 / r.summary.frameMs)} Hz)\n` +
    `${r.summary.smooth} smooth · ${r.summary.rough} rough · ${r.summary.janky} janky · ${r.summary.noData} not measured · worst frame ${r.summary.worstMs} ms · ${r.summary.droppedPct}% dropped · ${r.summary.resized} with a native resize\n`;
  const rows = r.results.map((x) =>
    `${x.verdict.padEnd(8)} ${x.label.padEnd(34)} dropped ${String(x.droppedPct).padStart(5)}%  worst ${String(x.worstMs).padStart(6)} ms  ${x.resizedMidAnimation ? "native " + x.nativeChanges.map((n) => `${n.kind}:${n.label}`).join(",") : ""}`.trimEnd()
  );
  return head + rows.join("\n") + "\n";
}
