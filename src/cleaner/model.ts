// Lens Cleaner's pure logic: the flow state machine, selection and totals, size formatting,
// count-up easing, the squarified treemap and the sunburst layout. No DOM, no IPC (bun tests).

import type { CleanerCategory, ScanReport, SpaceNode } from "./types";

// ── formatting ────────────────────────────────────────────────────────────────────────────────

/** "32.5 GB", "238 GB", "512 B" — decimal units like Windows Explorer's drive bars. */
export function fmtSize(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1000;
    i++;
  }
  if (i === 0) return `${Math.round(v)} B`;
  return `${v >= 100 ? Math.round(v) : (Math.round(v * 10) / 10).toFixed(1)} ${u[i]}`;
}

export function driveName(root: string): string {
  return root.replace(/[\\/]+$/, "");
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
}

/** Drive state: red under 10% free (or the alert threshold), amber under 25%, otherwise fine. */
export function driveTone(total: number, free: number): "danger" | "warn" | "ok" {
  const f = pct(free, total);
  if (f < 10) return "danger";
  if (f < 25) return "warn";
  return "ok";
}

export function ageLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const y = Math.round(days / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

// ── flow ──────────────────────────────────────────────────────────────────────────────────────

export type Screen = "home" | "scanning" | "cleanup" | "space" | "done";
export type CleanupTab = "cleanup" | "space" | "apps" | "timeline" | "downloads";

export interface FlowState {
  screen: Screen;
  tab: CleanupTab;
  report: ScanReport | null;
  /** Category ids ticked as a whole (SAFE / ADMIN). */
  ticked: string[];
  /** REVIEW picks: category → paths. */
  picks: Record<string, string[]>;
  expanded: string | null;
  freed: number;
  error: string | null;
}

export type FlowEvent =
  | { type: "scan" }
  | { type: "scanned"; report: ScanReport }
  | { type: "scan-failed"; error: string }
  | { type: "cancel" }
  | { type: "tab"; tab: CleanupTab }
  | { type: "toggle"; id: string }
  | { type: "pick"; category: string; path: string }
  | { type: "select-all-safe" }
  | { type: "select-none" }
  | { type: "expand"; id: string | null }
  | { type: "cleaned"; freed: number }
  | { type: "home" }
  | { type: "space" };

export const initialFlow: FlowState = { screen: "home", tab: "cleanup", report: null, ticked: [], picks: {}, expanded: null, freed: 0, error: null };

/** SAFE and pre-ticked categories start selected; REVIEW and ADMIN never do. */
export function defaultTicked(report: ScanReport): string[] {
  return report.categories.filter((c) => c.safety === "SAFE" && c.preTicked && c.size > 0).map((c) => c.id);
}

export function isWhole(c: CleanerCategory): boolean {
  return c.method === "deleteFiles" || c.method === "emptyRecycleBin" || c.method === "elevated" || c.method === "openSettings";
}

export function flow(s: FlowState, e: FlowEvent): FlowState {
  switch (e.type) {
    case "scan":
      return { ...s, screen: "scanning", error: null };
    case "scanned":
      return { ...s, screen: "cleanup", tab: "cleanup", report: e.report, ticked: defaultTicked(e.report), picks: {}, expanded: null };
    case "scan-failed":
      return { ...s, screen: "home", error: e.error };
    case "cancel":
      return { ...s, screen: s.report ? "cleanup" : "home" };
    case "tab":
      return { ...s, tab: e.tab, screen: e.tab === "space" ? "space" : s.report ? "cleanup" : s.screen };
    case "space":
      return { ...s, screen: "space", tab: "space" };
    case "toggle": {
      const c = s.report?.categories.find((x) => x.id === e.id);
      if (!c) return s;
      if (!isWhole(c)) {
        // A REVIEW category: the checkbox picks or clears all of its items.
        const all = c.items.map((i) => i.path);
        const cur = s.picks[c.id] ?? [];
        return { ...s, picks: { ...s.picks, [c.id]: cur.length === all.length ? [] : all } };
      }
      const on = s.ticked.includes(e.id);
      return { ...s, ticked: on ? s.ticked.filter((x) => x !== e.id) : [...s.ticked, e.id] };
    }
    case "pick": {
      const cur = s.picks[e.category] ?? [];
      const next = cur.includes(e.path) ? cur.filter((p) => p !== e.path) : [...cur, e.path];
      return { ...s, picks: { ...s.picks, [e.category]: next } };
    }
    case "select-all-safe":
      return { ...s, ticked: (s.report?.categories ?? []).filter((c) => c.safety === "SAFE" && c.size > 0).map((c) => c.id) };
    case "select-none":
      return { ...s, ticked: [], picks: {} };
    case "expand":
      return { ...s, expanded: s.expanded === e.id ? null : e.id };
    case "cleaned":
      return { ...s, screen: "done", freed: e.freed };
    case "home":
      return { ...initialFlow };
  }
}

/** Bytes the current selection would free (ADMIN steps count their measured size). */
export function selectedBytes(s: FlowState): number {
  const cats = s.report?.categories ?? [];
  let n = 0;
  for (const c of cats) {
    if (isWhole(c)) {
      if (s.ticked.includes(c.id) && c.method !== "openSettings") n += c.size;
    } else {
      const picked = new Set(s.picks[c.id] ?? []);
      for (const it of c.items) if (picked.has(it.path)) n += it.size;
    }
  }
  return n;
}

export function selectedCount(s: FlowState): number {
  return s.ticked.length + Object.values(s.picks).reduce((a, v) => a + v.length, 0);
}

/** "checked" | "mixed" | "unchecked" for a category row's checkbox. */
export function checkState(s: FlowState, c: CleanerCategory): "checked" | "mixed" | "unchecked" {
  if (isWhole(c)) return s.ticked.includes(c.id) ? "checked" : "unchecked";
  const n = (s.picks[c.id] ?? []).length;
  if (n === 0) return "unchecked";
  return n === c.items.length ? "checked" : "mixed";
}

/** What the preview / clean call needs. */
export function selectionPayload(s: FlowState): { categories: string[]; picks: { category: string; path: string; link?: string | null; size?: number }[] } {
  const cats = s.report?.categories ?? [];
  const picks: { category: string; path: string; link?: string | null; size?: number }[] = [];
  for (const [cat, paths] of Object.entries(s.picks)) {
    const c = cats.find((x) => x.id === cat);
    for (const p of paths) {
      const it = c?.items.find((i) => i.path === p);
      picks.push({ category: cat, path: p, link: it?.link ?? null, size: it?.size ?? 0 });
    }
  }
  return { categories: s.ticked, picks };
}

/** Header numbers: SAFE total and "worth a look". */
export function headline(r: ScanReport): { safe: number; review: number; empty: boolean } {
  return { safe: r.safeBytes, review: r.reviewBytes, empty: r.safeBytes + r.reviewBytes < 50_000_000 };
}

/** Categories in display order: SAFE (biggest first), then ADMIN, then REVIEW. */
export function ordered(r: ScanReport): CleanerCategory[] {
  const rank = { SAFE: 0, ADMIN: 1, REVIEW: 2 } as const;
  return [...r.categories].sort((a, b) => rank[a.safety] - rank[b.safety] || b.size - a.size);
}

// ── keyboard ──────────────────────────────────────────────────────────────────────────────────

export type KeyAction = "toggle" | "select-all-safe" | "clean" | "smart" | "rescan" | "back" | "next" | "prev" | "expand" | null;

/** Space toggles the focused row, Ctrl+A selects all SAFE, Enter cleans, Ctrl+Enter is Smart
 *  Clean, Ctrl+R rescans, ↑/↓ move, →/← expand/collapse, Esc goes back one level. */
export function keyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; target?: { tagName?: string } | null }): KeyAction {
  const tag = (e.target?.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "a") return "select-all-safe";
  if (mod && e.key.toLowerCase() === "r") return "rescan";
  if (mod && e.key === "Enter") return "smart";
  if (e.key === "Enter") return "clean";
  if (e.key === " ") return "toggle";
  if (e.key === "Escape") return "back";
  if (e.key === "ArrowDown") return "next";
  if (e.key === "ArrowUp") return "prev";
  if (e.key === "ArrowRight") return "expand";
  return null;
}

// ── motion ────────────────────────────────────────────────────────────────────────────────────

/** Ease-out (quint): fast start, soft landing — the count-up curve. */
export function easeOutQuint(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 5);
}

/** Value of a count-up at time `elapsed` of `duration`, from `from` to `to`. */
export function countAt(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0) return to;
  return from + (to - from) * easeOutQuint(elapsed / duration);
}

// ── treemap (squarified, Bruls et al.) ────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapCell<T> extends Rect {
  item: T;
}

function worst(row: number[], side: number, scale: number): number {
  const areas = row.map((v) => v * scale);
  const s = areas.reduce((a, b) => a + b, 0);
  if (s <= 0) return Infinity;
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

/** Lays out items (already filtered to size > 0) inside `r`, biggest first. */
export function squarify<T>(items: T[], size: (t: T) => number, r: Rect): TreemapCell<T>[] {
  const list = items.filter((i) => size(i) > 0).sort((a, b) => size(b) - size(a));
  const total = list.reduce((a, i) => a + size(i), 0);
  const out: TreemapCell<T>[] = [];
  if (!list.length || r.w <= 0 || r.h <= 0 || total <= 0) return out;
  let rect = { ...r };
  let remaining = total;
  let i = 0;
  while (i < list.length) {
    const scale = (rect.w * rect.h) / remaining;
    const side = Math.min(rect.w, rect.h);
    const row: T[] = [list[i]];
    let j = i + 1;
    while (j < list.length) {
      const cur = row.map(size);
      const next = [...cur, size(list[j])];
      if (worst(next, side, scale) > worst(cur, side, scale)) break;
      row.push(list[j]);
      j++;
    }
    const rowSum = row.reduce((a, t) => a + size(t), 0);
    const rowArea = rowSum * scale;
    if (rect.w >= rect.h) {
      const w = j >= list.length ? rect.w : rowArea / rect.h;
      let y = rect.y;
      for (const t of row) {
        const h = (size(t) / rowSum) * rect.h;
        out.push({ x: rect.x, y, w, h, item: t });
        y += h;
      }
      rect = { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h };
    } else {
      const h = j >= list.length ? rect.h : rowArea / rect.w;
      let x = rect.x;
      for (const t of row) {
        const w = (size(t) / rowSum) * rect.w;
        out.push({ x, y: rect.y, w, h, item: t });
        x += w;
      }
      rect = { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
    }
    remaining -= rowSum;
    i = j;
  }
  return out;
}

/** Grid-aware arrow navigation: the cell whose centre is nearest in that direction. */
export function neighbour(cells: Rect[], from: number, dir: "left" | "right" | "up" | "down"): number {
  const c = cells[from];
  if (!c) return from;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  let best = from;
  let bestD = Infinity;
  cells.forEach((o, i) => {
    if (i === from) return;
    const ox = o.x + o.w / 2;
    const oy = o.y + o.h / 2;
    const dx = ox - cx;
    const dy = oy - cy;
    const ok = dir === "left" ? dx < -1 : dir === "right" ? dx > 1 : dir === "up" ? dy < -1 : dy > 1;
    if (!ok) return;
    const along = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const d = along + across * 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// ── sunburst (DaisyDisk-style) ────────────────────────────────────────────────────────────────

export interface Arc {
  node: SpaceNode;
  depth: number;
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  /** The translucent "smaller items" petal. */
  small: boolean;
}

/** Rings for `children` (each may carry its own children), spanning the full circle. Items
 *  thinner than `minAngle` merge into the parent's "smaller items" petal. */
export function sunburst(children: SpaceNode[], total: number, opts: { inner: number; ring: number; depth: number; minAngle?: number }): Arc[] {
  const arcs: Arc[] = [];
  const minA = opts.minAngle ?? 0.012;
  const walk = (nodes: SpaceNode[], sum: number, a0: number, a1: number, depth: number) => {
    if (depth >= opts.depth || sum <= 0) return;
    const span = a1 - a0;
    let a = a0;
    let tiny = 0;
    for (const n of [...nodes].sort((x, y) => y.size - x.size)) {
      const w = (n.size / sum) * span;
      if (w <= 0) continue;
      const small = n.note === "smaller";
      if (w < minA && !small) {
        tiny += w;
        continue;
      }
      const r0 = opts.inner + depth * opts.ring;
      arcs.push({ node: n, depth, a0: a, a1: a + w, r0, r1: r0 + opts.ring - 2, small });
      if (n.children?.length) walk(n.children, n.size, a, a + w, depth + 1);
      a += w;
    }
    if (tiny > 0) {
      const r0 = opts.inner + depth * opts.ring;
      arcs.push({ node: { id: -1, name: "Smaller items", path: "", size: (tiny / span) * sum, files: 0, kind: "file", hasChildren: false, ageDays: 0, note: "smaller", children: [] }, depth, a0: a, a1: a + tiny, r0, r1: r0 + opts.ring - 2, small: true });
    }
  };
  walk(children, total, 0, Math.PI * 2, 0);
  return arcs;
}

/** SVG path for a ring segment centred on (cx, cy). Angles start at 12 o'clock, clockwise. */
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const gap = Math.min(0.004, (a1 - a0) / 4);
  const s = a0 + gap;
  const e = Math.max(s + 0.0001, a1 - gap);
  const pt = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  const large = e - s > Math.PI ? 1 : 0;
  if (e - s >= Math.PI * 2 - 0.01) {
    // Full ring: two halves.
    const m = s + Math.PI;
    return `M${pt(r1, s)} A${r1} ${r1} 0 1 1 ${pt(r1, m)} A${r1} ${r1} 0 1 1 ${pt(r1, s)} M${pt(r0, s)} A${r0} ${r0} 0 1 0 ${pt(r0, m)} A${r0} ${r0} 0 1 0 ${pt(r0, s)}Z`;
  }
  return `M${pt(r0, s)} L${pt(r1, s)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, e)} L${pt(r0, e)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, s)}Z`;
}

/** Siblings order for keyboard navigation in the sunburst: same ring, by angle. */
export function ringSiblings(arcs: Arc[], at: Arc): Arc[] {
  return arcs.filter((a) => a.depth === at.depth).sort((x, y) => x.a0 - y.a0);
}

// ── sparkline ─────────────────────────────────────────────────────────────────────────────────

export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

// ── copy ──────────────────────────────────────────────────────────────────────────────────────

export const COPY = {
  homeTitle: "Let's make some room.",
  homeSub: "Lens looks for things your PC can safely let go of, and shows you everything before anything is removed.",
  scanNote: "Takes a few seconds. Nothing gets deleted until you say so.",
  scanning: "Looking around your PC…",
  emptyTitle: "You're in great shape.",
  emptySub: "Nothing worth cleaning right now. Check back in a few weeks.",
  reviewLine: (n: string) => `Plus ${n} more that's worth a look. That part is your call.`,
  foundTitle: (n: string) => `We found ${n} safe to clean`,
  doneTitle: (n: string) => `You just freed ${n}`,
  undo: "Restore from Recycle Bin",
};

// ---- permanent delete: the typed one-time code -------------------------------------------------

/** Digits only, capped at the code's length (people paste "4827 " or type "48 27"). */
export function cleanCode(typed: string, digits = 4): string {
  return typed.replace(/\D/g, "").slice(0, digits);
}

/**
 * Where the confirm step is: "bin" (no code needed), "loading" (waiting for Rust to mint one),
 * "expired", "type" (code shown, not typed yet) or "hold" (typed: the hold-to-confirm card shows).
 */
export function confirmStep(permanent: boolean, code: string | null, typed: string, expired: boolean): "bin" | "loading" | "expired" | "type" | "hold" {
  if (!permanent) return "bin";
  if (expired) return "expired";
  if (!code) return "loading";
  return cleanCode(typed, code.length) === code ? "hold" : "type";
}

// ---- measured scan time ------------------------------------------------------------------------

/** The scan-time target from the Cleaner's checklist. */
export const SCAN_TARGET_MS = 10_000;

/** "3.4 s", "0.4 s", "1 min 12 s". */
export function fmtScanTime(ms: number): string {
  const v = Math.max(0, ms);
  if (v < 59_950) return `${(v / 1000).toFixed(1)} s`;
  const total = Math.round(v / 1000);
  const s = total % 60;
  return s ? `${Math.floor(total / 60)} min ${s} s` : `${Math.floor(total / 60)} min`;
}
