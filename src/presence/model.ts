// Pure model for the "Lens at work" overlay: eased travel path, step → visual state, captions.
// No DOM, no Tauri — unit tested in src/__tests__/presence.test.ts and rendered by the parity
// gallery (tools/parity/presence). Rust twin: src-tauri/src/presence/{geom,queue}.rs.

import type { LRect, PresenceEvent, StepKind, Visual } from "./types";

export interface Pt {
  x: number;
  y: number;
}

export const ORB_SIZE = 28;
/** The orb parks this far beside an approval card while waiting. */
export const PARK_GAP = 14;

/** Same as geom::travel_ms: 250–450 ms by distance. */
export function travelMs(dist: number): number {
  const d = Number.isFinite(dist) ? Math.abs(dist) : 0;
  return Math.round(250 + Math.min(d / 1600, 1) * 200);
}

export function center(r: LRect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Where the orb rests for a step: on the target centre, or beside it when waiting. */
export function restPoint(kind: StepKind, target: LRect | null, dest: LRect | null, from: Pt): Pt {
  const r = target ?? dest;
  if (!r) return from;
  if (kind === "wait") return { x: r.x - PARK_GAP - ORB_SIZE / 2, y: r.y + Math.min(28, r.h / 2) };
  if (kind === "window" && dest) return center(dest);
  return center(r);
}

/** Gentle curve: control point lifted perpendicular to the path (≤ 12 % of its length, ≤ 120 px). */
export function controlPoint(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { ...a };
  const lift = Math.min(len * 0.12, 120);
  return { x: (a.x + b.x) / 2 - (dy / len) * lift, y: (a.y + b.y) / 2 + (dx / len) * lift };
}

/** easeInOutCubic */
export function ease(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Point on the eased quadratic bezier a → b at time t ∈ [0,1]. */
export function pathAt(a: Pt, b: Pt, t: number): Pt {
  const c = controlPoint(a, b);
  const e = ease(t);
  const k = 1 - e;
  return { x: k * k * a.x + 2 * k * e * c.x + e * e * b.x, y: k * k * a.y + 2 * k * e * c.y + e * e * b.y };
}

/** Sampled path (for the parity gallery's travel frames and tests). */
export function pathPoints(a: Pt, b: Pt, n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(pathAt(a, b, i / n));
  return out;
}

/** What the overlay draws for one step. */
export interface Scene {
  visual: Visual;
  /** Orb drawn (Full only). */
  orb: boolean;
  /** Orb travels along the curve; otherwise it fades in place (reduced motion / Subtle / catch-up). */
  travel: boolean;
  from: Pt;
  to: Pt;
  durationMs: number;
  ring: LRect | null;
  ripple: Pt | null;
  ghost: { from: LRect | null; to: LRect } | null;
  chip: { kind: "type" | "setting"; text: string } | null;
  caption: string | null;
  error: boolean;
  /** Waiting beside a card: the caption sits on the orb's far side. */
  parked: boolean;
}

export function sceneFor(ev: PresenceEvent, from: Pt | null): Scene {
  const visual = ev.visual;
  const target = ev.target;
  const start = from ?? (target ? { x: target.x - 120, y: target.y + target.h + 80 } : { x: 0, y: 0 });
  const to = restPoint(ev.kind, target, ev.dest, start);
  const orb = visual === "full";
  const travel = orb && ev.travel && !ev.catchUp && from !== null;
  const chipText =
    ev.kind === "type" && ev.text
      ? ev.text
      : ev.kind === "setting" && ev.settings.length
        ? ev.settings.join(" · ")
        : null;
  return {
    visual,
    orb,
    travel,
    from: travel ? start : to,
    to,
    durationMs: ev.catchUp ? 0 : Math.max(0, ev.durationMs),
    ring: visual === "none" || ev.kind === "done" ? null : (target ?? ev.dest),
    ripple: visual !== "none" && ev.kind === "click" && target ? center(target) : null,
    ghost: visual !== "none" && ev.kind === "window" && ev.dest ? { from: target, to: ev.dest } : null,
    chip: visual === "none" || !chipText ? null : { kind: ev.kind === "type" ? "type" : "setting", text: chipText },
    caption: visual !== "none" && ev.captions ? ev.caption : null,
    error: ev.kind === "error",
    parked: ev.kind === "wait" && target !== null,
  };
}

/** Caption for previews in the parity gallery / Settings card; mirrors presence::caption. */
export function caption(actor: string, label: string, index: number, total: number | null): string {
  const clean = Array.from(label)
    .filter((c) => c >= " ")
    .slice(0, 80)
    .join("")
    .trim();
  let s = `${actor} · ${clean}`;
  if (total != null) {
    const t = Math.max(total, 1);
    s += ` · ${Math.min(index, t)}/${t}`;
  } else if (index > 1) {
    s += ` · step ${index}`;
  }
  return s;
}

/** Last-ditch mask for text a Lens window shows locally (the backend masks before it emits). */
export function maskLocal(text: string, secret: boolean): string {
  if (secret) return "•••";
  return text.replace(/\b(sk|pk|rk|ghp|gho|xox[abp]|AKIA)[-_A-Za-z0-9]{8,}\b/g, "•••").replace(/\b\d{13,19}\b/g, "•••");
}

/** The in-app twin's label → a settings anchor (data-guide-id) guess. */
export function twinAnchor(setting: string): string | null {
  const s = setting.toLowerCase();
  if (s.startsWith("theme")) return "theme";
  if (s.startsWith("mode")) return "theme-mode";
  if (s.startsWith("accent")) return "accent";
  if (s.startsWith("dock")) return "dock";
  if (s.startsWith("night light")) return "night-light";
  if (s.startsWith("focus")) return "focus";
  if (s.startsWith("do not disturb")) return "dnd";
  if (s.startsWith("sound") || s.startsWith("volume")) return "volume";
  if (s.startsWith("brightness")) return "brightness";
  if (s.startsWith("scene")) return "scene";
  return null;
}

/** Hotkeys Lens already uses (Command, palette, snip, tiling, clipboard, voice, quit…). */
export const TAKEN_HOTKEYS = [
  "Alt+Space", "Ctrl+Space", "Ctrl+Alt+Space", "Ctrl+Alt+Shift+Space", "Ctrl+Alt+X", "Ctrl+Alt+S",
  "Ctrl+Alt+Q", "Ctrl+Alt+T", "Ctrl+Alt+V", "Ctrl+Alt+Shift+V", "Ctrl+Alt+U", "Ctrl+Shift+F12", "Alt+W",
  "Alt+Shift+T", "Ctrl+Alt+Up", "Ctrl+Alt+Down", "Ctrl+Alt+Left", "Ctrl+Alt+Right", "Ctrl+Alt+Shift+E",
  "Ctrl+Alt+W", "Ctrl+Alt+Shift+Right", "Ctrl+Alt+Shift+Left",
];

const norm = (s: string) =>
  s
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("+");

/** null = fine; otherwise why it can't be used. */
export function hotkeyProblem(hk: string): string | null {
  const parts = hk.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return "Use a modifier, e.g. Ctrl+Alt+Pause.";
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  if (!mods.every((m) => ["ctrl", "alt", "shift", "win", "super"].includes(m))) return "Modifiers are Ctrl, Alt, Shift and Win.";
  if (TAKEN_HOTKEYS.some((t) => norm(t) === norm(hk))) return "Lens already uses this shortcut.";
  return null;
}
