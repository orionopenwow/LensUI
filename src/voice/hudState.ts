// What the voice HUD shows, derived from backend events. Pure, so every state is unit-tested
// and the parity gallery can render each one from fixtures.

import type { VoiceHeardEvent, VoicePhase, VoiceResultEvent, VoiceStateEvent } from "./contract";

export const LEVEL_BARS = 24;

export interface HudState {
  phase: VoicePhase;
  enabled: boolean;
  muted: boolean;
  listening: boolean;
  /** The current utterance came from push-to-talk. */
  byPtt: boolean;
  pausedReason: string | null;
  position: "dock" | "top";
  sounds: boolean;
  /** Recent mic levels, oldest first (0..1). */
  levels: number[];
  heard: string;
  partial: boolean;
  result: VoiceResultEvent | null;
  /** The help sheet is open. */
  help: boolean;
  /** The Dock is showing the voice UI, so this HUD stays hidden (except help). */
  dockUi: boolean;
}

export const INITIAL_HUD: HudState = {
  phase: "off",
  enabled: false,
  muted: false,
  listening: false,
  byPtt: true,
  pausedReason: null,
  position: "dock",
  sounds: true,
  levels: Array(LEVEL_BARS).fill(0),
  heard: "",
  partial: false,
  result: null,
  help: false,
  dockUi: false,
};

export type HudAction =
  | { kind: "state"; payload: VoiceStateEvent }
  | { kind: "level"; level: number }
  | { kind: "heard"; payload: VoiceHeardEvent }
  | { kind: "result"; payload: VoiceResultEvent }
  | { kind: "help"; open: boolean }
  | { kind: "dismiss" };

export function reduceHud(s: HudState, a: HudAction): HudState {
  switch (a.kind) {
    case "state": {
      const p = a.payload;
      const next: HudState = {
        ...s,
        phase: p.phase,
        enabled: p.enabled,
        muted: p.muted,
        listening: p.listening,
        byPtt: p.by_ptt,
        pausedReason: p.paused_reason,
        position: p.hud_position === "top" ? "top" : "dock",
        sounds: p.sounds,
        dockUi: !!p.dock_ui,
      };
      // A new utterance starts clean.
      if (p.phase === "listening" && s.phase !== "listening") {
        next.heard = "";
        next.partial = false;
        next.levels = Array(LEVEL_BARS).fill(0);
        if (s.result?.status !== "confirm" && s.result?.status !== "suggest") next.result = null;
      }
      if (p.phase === "idle" && s.phase !== "idle") next.levels = Array(LEVEL_BARS).fill(0);
      return next;
    }
    case "level": {
      const v = Number.isFinite(a.level) ? Math.min(1, Math.max(0, a.level)) : 0;
      return { ...s, levels: [...s.levels.slice(1), v] };
    }
    case "heard":
      // A late partial never overwrites the final text.
      if (a.payload.partial && !s.partial && s.heard && s.phase !== "listening") return s;
      return { ...s, heard: a.payload.text, partial: a.payload.partial };
    case "result":
      return { ...s, result: a.payload, heard: a.payload.heard || s.heard, partial: false, help: a.payload.command === "help" ? true : s.help };
    case "help":
      return { ...s, help: a.open };
    case "dismiss":
      return { ...s, result: null, help: false };
  }
}

export type HudTone = "listening" | "thinking" | "ok" | "ask" | "warn" | "error" | "muted" | "quiet";
export type HudButton = "yes" | "no" | "undo" | "cancel" | "help" | "unmute";

export interface HudView {
  visible: boolean;
  tone: HudTone;
  title: string;
  detail: string;
  /** Recognised command chip, e.g. "Minimise the window". */
  chip: string | null;
  buttons: HudButton[];
  showWave: boolean;
  /** One-line hint under the card ("Say yes or no"). */
  hint: string | null;
}

const quote = (t: string) => (t ? `“${t}”` : "");

/** The single source of truth for what the HUD says in each state. */
export function hudView(s: HudState): HudView {
  const hidden: HudView = { visible: false, tone: "quiet", title: "", detail: "", chip: null, buttons: [], showWave: false, hint: null };
  const r = s.result;
  if (!s.enabled && !r) return hidden;
  // The Dock is the primary voice UI; this HUD is the fallback when no Dock shows it.
  if (s.dockUi && s.phase !== "muted") return hidden;

  if (s.phase === "listening") {
    const answering = r?.status === "confirm" || r?.status === "suggest";
    return {
      visible: true,
      tone: "listening",
      title: answering ? r!.label : "Listening…",
      detail: s.heard ? quote(s.heard) : answering ? "" : "Try “minimise this”",
      chip: null,
      buttons: answering ? ["yes", "no"] : ["cancel"],
      showWave: true,
      hint: answering ? "Say yes or no" : s.byPtt ? "Let go of the key when you're done" : "Pause when you're done",
    };
  }
  if (s.phase === "thinking") {
    return { visible: true, tone: "thinking", title: s.heard ? quote(s.heard) : "Working on it…", detail: s.heard ? "Working on it…" : "", chip: null, buttons: ["cancel"], showWave: false, hint: null };
  }
  if (r && (s.phase === "confirming" || r.status === "confirm" || r.status === "suggest") && (r.status === "confirm" || r.status === "suggest")) {
    return {
      visible: true,
      tone: "ask",
      title: r.label,
      detail: r.heard ? `Heard ${quote(r.heard)}` : r.message,
      chip: null,
      buttons: ["yes", "no"],
      showWave: false,
      hint: "Say yes or no",
    };
  }
  if (r && (s.phase === "done" || s.phase === "idle" || s.phase === "error" || s.phase === "muted" || s.phase === "paused")) {
    switch (r.status) {
      case "done":
        return {
          visible: s.phase === "done" || !!r.undo,
          tone: "ok",
          title: r.label,
          detail: r.message,
          chip: r.label,
          buttons: r.undo ? ["undo"] : [],
          showWave: false,
          hint: r.undo ? "Say “undo” to take it back" : null,
        };
      case "refused":
        return { visible: true, tone: "warn", title: r.label || "Not allowed", detail: r.message, chip: null, buttons: [], showWave: false, hint: null };
      case "failed":
        return {
          visible: true,
          tone: "error",
          title: r.label || "Didn't catch that",
          detail: r.message,
          chip: null,
          buttons: ["help"],
          showWave: false,
          hint: "Say “Lens, help” for commands",
        };
      case "hint":
      case "info":
        return { visible: true, tone: s.muted ? "muted" : "quiet", title: r.label, detail: r.message, chip: null, buttons: s.muted ? ["unmute"] : [], showWave: false, hint: null };
    }
  }
  if (s.phase === "muted") {
    return { visible: false, tone: "muted", title: "Voice muted", detail: "", chip: null, buttons: ["unmute"], showWave: false, hint: null };
  }
  return hidden;
}

/** Bar heights (px) for the waveform, with a floor so silence still shows a resting line. */
export function waveHeights(levels: number[], max = 22, min = 3): number[] {
  return levels.map((l) => Math.round(min + Math.pow(Math.min(1, Math.max(0, l)), 0.7) * (max - min)));
}

/** Filters the command list for the settings search and the help sheet. */
export function filterCommands<T extends { title: string; examples: string[]; group: string }>(list: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter((c) => c.title.toLowerCase().includes(t) || c.group.toLowerCase().includes(t) || c.examples.some((e) => e.toLowerCase().includes(t)));
}
