// The Dock as the voice UI: what it shows at each moment (pure, tested), and how the voice
// content fits inside the Dock's existing width (the Dock never widens).

import type { VoiceHeardEvent, VoiceResultEvent, VoiceStateEvent } from "../../voice/contract";

export type MorphStage = "idle" | "listening" | "partial" | "recognised" | "confirm" | "error";

export interface MorphState {
  stage: MorphStage;
  /** Words recognised twice in a row (stable) and the still-changing tail. */
  confirmed: string;
  partial: string;
  chip: string | null;
  undo: string | null;
  /** The chip (and its undo key) stay until this time (ms). */
  until: number;
  confirm: { label: string; heard: string } | null;
  error: string | null;
  latencyMs: number | null;
  early: boolean;
}

export const IDLE: MorphState = { stage: "idle", confirmed: "", partial: "", chip: null, undo: null, until: 0, confirm: null, error: null, latencyMs: null, early: false };

/** How long a recognised chip shows: 1.5 s with an undo key, 1.1 s without. */
export const CHIP_MS = 1500;
export const CHIP_NO_UNDO_MS = 1100;
export const ERROR_MS = 2200;

export type MorphAction =
  | { kind: "state"; payload: VoiceStateEvent; now: number }
  | { kind: "heard"; payload: VoiceHeardEvent }
  | { kind: "result"; payload: VoiceResultEvent; now: number }
  | { kind: "tick"; now: number }
  | { kind: "dismiss" };

/** Common prefix of two word lists: words seen in two partials in a row are "confirmed". */
export function splitStable(prev: string, next: string): { confirmed: string; partial: string } {
  const a = prev.trim().split(/\s+/).filter(Boolean);
  const b = next.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase().replace(/[.,!?]$/, "") === b[i].toLowerCase().replace(/[.,!?]$/, "")) i++;
  return { confirmed: b.slice(0, i).join(" "), partial: b.slice(i).join(" ") };
}

export function reduceMorph(s: MorphState, a: MorphAction): MorphState {
  switch (a.kind) {
    case "state": {
      const p = a.payload;
      // Speech that isn't for Lens (wake mode, no "Lens") never morphs the Dock.
      if (p.phase === "listening") {
        if (!p.armed) return s.stage === "listening" || s.stage === "partial" ? IDLE : s;
        if (s.stage === "idle" || s.stage === "recognised" || s.stage === "error") return { ...IDLE, stage: "listening" };
        return s;
      }
      if (p.phase === "thinking") return s.stage === "idle" && p.armed ? { ...IDLE, stage: "listening" } : s;
      if ((p.phase === "idle" || p.phase === "muted" || p.phase === "paused" || p.phase === "off") && (s.stage === "listening" || s.stage === "partial")) return IDLE; // cancelled
      if (p.phase === "off") return IDLE;
      return s;
    }
    case "heard": {
      if (s.stage !== "listening" && s.stage !== "partial") return s;
      const text = a.payload.text.trim();
      if (!text) return s;
      if (!a.payload.partial) return { ...s, stage: "partial", confirmed: text, partial: "" };
      const prev = [s.confirmed, s.partial].filter(Boolean).join(" ");
      return { ...s, stage: "partial", ...splitStable(prev, text) };
    }
    case "result": {
      const r = a.payload;
      if (r.status === "done") {
        const chip = r.label || r.message;
        return { ...IDLE, stage: "recognised", chip, undo: r.undo, until: a.now + (r.undo ? CHIP_MS : CHIP_NO_UNDO_MS), latencyMs: r.latency_ms ?? null, early: !!r.early, confirmed: r.heard || s.confirmed };
      }
      if (r.status === "confirm" || r.status === "suggest") return { ...s, stage: "confirm", confirm: { label: r.label, heard: r.heard } };
      if (r.status === "failed" || r.status === "refused") return { ...IDLE, stage: "error", error: r.message || r.label, until: a.now + ERROR_MS };
      return s; // info / hint stay in the HUD
    }
    case "tick":
      if ((s.stage === "recognised" || s.stage === "error") && a.now >= s.until) return IDLE;
      return s;
    case "dismiss":
      return IDLE;
  }
}

// ---------------------------------------------------------------------------------------------
// Width-locked layout
// ---------------------------------------------------------------------------------------------

export type DockStyleId = "floating" | "slim" | "taskbar" | "studio" | "minimal" | "split";
export type Edge = "bottom" | "top" | "left" | "right";

export interface VoiceDockLayout {
  vertical: boolean;
  /** Content box inside the pill (px). Never larger than the pill. */
  width: number;
  height: number;
  pad: number;
  /** Hold-to-talk button (always at the Dock's end). */
  mic: number;
  /** Compressed app icons: how many stay visible and at what size (0 = thin strip only). */
  iconSize: number;
  iconsShown: number;
  iconStrip: number;
  wave: number;
  transcript: number;
  gap: number;
  /** Vertical Docks show the transcript in a flyout beside the Dock. */
  flyout: boolean;
}

const STYLE: Record<DockStyleId, { pad: number; icon: number; gap: number }> = {
  floating: { pad: 10, icon: 18, gap: 8 },
  slim: { pad: 6, icon: 14, gap: 6 },
  taskbar: { pad: 8, icon: 16, gap: 8 },
  studio: { pad: 8, icon: 16, gap: 8 },
  minimal: { pad: 8, icon: 16, gap: 8 },
  split: { pad: 10, icon: 18, gap: 8 },
};

/** Fits the voice UI into the Dock's current box. The sum of the parts never exceeds it. */
export function voiceDockLayout(style: DockStyleId, edge: Edge, width: number, height: number, appCount: number): VoiceDockLayout {
  const st = STYLE[style] ?? STYLE.floating;
  const vertical = edge === "left" || edge === "right";
  const along = Math.max(0, Math.floor(vertical ? height : width));
  const across = Math.max(0, Math.floor(vertical ? width : height));
  const pad = Math.min(st.pad, Math.floor(across / 4));
  const mic = Math.max(20, Math.min(40, across - pad * 2));
  const inner = Math.max(0, along - pad * 2 - mic - st.gap);
  if (vertical) {
    // Icons fade to a thin strip; a vertical waveform fills the rest; words go to a flyout.
    const strip = Math.min(inner * 0.3, appCount * (st.icon + 2));
    const wave = Math.max(0, inner - strip - st.gap);
    return { vertical, width: Math.floor(width), height: Math.floor(height), pad, mic, iconSize: st.icon, iconsShown: Math.floor(strip / (st.icon + 2)), iconStrip: Math.floor(strip), wave: Math.floor(wave), transcript: 0, gap: st.gap, flyout: true };
  }
  // Icons compress to a strip at the end (up to 30 % of the room, fewer when narrow).
  let iconSize = st.icon;
  let shown = Math.min(appCount, Math.floor((inner * 0.3) / (iconSize + 2)));
  if (inner < 300) {
    shown = Math.min(appCount, Math.floor((inner * 0.18) / (iconSize + 2)));
  }
  if (shown <= 0) iconSize = 0;
  const strip = shown > 0 ? shown * (iconSize + 2) : 0;
  const rest = Math.max(0, inner - strip - (strip ? st.gap : 0));
  const wave = Math.floor(Math.min(140, Math.max(40, rest * 0.26)));
  const transcript = Math.max(0, rest - wave - st.gap);
  return { vertical, width: Math.floor(width), height: Math.floor(height), pad, mic, iconSize, iconsShown: shown, iconStrip: strip, wave: Math.min(wave, rest), transcript: Math.floor(transcript), gap: st.gap, flyout: transcript < 96 };
}

/** Total length the layout uses along the Dock (for the width-lock tests). */
export function usedLength(l: VoiceDockLayout): number {
  const parts = [l.iconStrip, l.wave, l.transcript].filter((x) => x > 0);
  return l.pad * 2 + l.mic + l.gap + parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * l.gap;
}
