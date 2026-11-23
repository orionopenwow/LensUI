// Lens voice control: commands, events and types (mirrors src-tauri/src/voice and
// src-tauri/src/commands/voice.rs; see docs/VOICE.md).

import { invoke } from "@tauri-apps/api/core";
import type * as Gen from "../types/generated";

export type VoiceConfig = Gen.VoiceConfig;
export type VoiceStatus = Gen.VoiceStatus;
export type VoiceMic = Gen.Mic;

export type VoicePhase = "off" | "idle" | "listening" | "thinking" | "confirming" | "done" | "error" | "muted" | "paused";

export interface VoiceStateEvent {
  phase: VoicePhase;
  enabled: boolean;
  muted: boolean;
  /** The microphone is open right now (Windows' mic indicator is on). */
  listening: boolean;
  by_ptt: boolean;
  activation: "ptt" | "wake" | "both" | string;
  paused_reason: string | null;
  hud_position: "dock" | "top" | string;
  sounds: boolean;
  /** Conversation mode is on (speech needs no key or wake phrase). */
  conversation?: boolean;
  /** "off" | "panel" | "fullscreen" */
  conversation_view?: string;
  /** Lens is speaking an answer. */
  speaking?: boolean;
}

/** Word progress of a spoken answer. `word` indexes whitespace-separated words. */
export interface VoiceSpeechEvent {
  id: number;
  word: number;
  done: boolean;
  interrupted: boolean;
}

export type VoiceResultStatus = "done" | "failed" | "confirm" | "suggest" | "refused" | "info" | "hint";

export interface VoiceResultEvent {
  status: VoiceResultStatus;
  heard: string;
  command: string | null;
  label: string;
  message: string;
  confidence: number;
  undo: string | null;
  suggestion: string | null;
}

export interface VoiceHeardEvent {
  text: string;
  partial: boolean;
  ms?: number;
}

/** UI-layer actions voice asks other surfaces to do. */
export type VoiceApplyAction = "help" | "shelf_open" | "shelf_add_selection" | "shelf_clear" | "summarize" | "ask" | "read_back" | "conversation";

export interface VoiceApplyEvent {
  action: VoiceApplyAction;
  args: { target?: "page" | "selection" | "auto"; text?: string; conversation?: boolean; open?: boolean };
}

export interface VoiceCommandInfo {
  id: string;
  group: string;
  title: string;
  examples: string[];
  risk: "low" | "confirm" | "guarded";
}

export const VOICE_EVENTS = {
  state: "lens://voice/state",
  level: "lens://voice/level",
  heard: "lens://voice/heard",
  result: "lens://voice/result",
  apply: "lens://voice/apply",
  speech: "lens://voice/speech",
} as const;

export const VOICE_GROUPS = ["Windows", "Apps", "Desktop", "Look", "System", "Shelf & clipboard", "Ask & Command", "Voice"] as const;

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  activation: "ptt",
  ptt_hotkey: "Ctrl+Alt+V",
  ptt_style: "hold",
  mute_hotkey: "Ctrl+Alt+Shift+V",
  wake_phrase: "Hey Lens",
  sensitivity: 0.5,
  mic_id: "",
  language: "en",
  whisper_server_path: "",
  whisper_model_path: "",
  threads: 4,
  cloud_speech: false,
  pause_in_meetings: true,
  pause_in_fullscreen: true,
  confirm_by_voice: true,
  allow_typing: true,
  tts_enabled: false,
  tts_voice: "",
  sounds: true,
  hud_position: "dock",
  conversation: "panel",
  disabled_commands: [],
  aliases: [],
};

// --- commands --------------------------------------------------------------------------------

export const voiceStatus = () => invoke<VoiceStatus>("voice_status");
export const voiceSetConfig = (config: VoiceConfig) => invoke<VoiceStatus>("voice_set_config", { config });
/** Mic button: true on press, false on release. */
export const voicePtt = (down: boolean) => invoke<void>("voice_ptt", { down });
export const voiceMute = (muted: boolean) => invoke<void>("voice_mute", { muted });
export const voiceCancel = () => invoke<void>("voice_cancel");
export const voiceAnswer = (yes: boolean) => invoke<void>("voice_answer", { yes });
export const voiceUndo = () => invoke<string>("voice_undo");
/** A typed command through the same grammar and safety rules. */
export const voiceRunText = (text: string) => invoke<void>("voice_run_text", { text });
export const voiceCommands = () => invoke<VoiceCommandInfo[]>("voice_commands");
export const voiceTestMic = (on: boolean) => invoke<void>("voice_test_mic", { on });
export const voiceListMics = () => invoke<VoiceMic[]>("voice_list_mics");
export const voiceListTtsVoices = () => invoke<string[]>("voice_list_tts_voices");
export const voiceSpeak = (text: string) => invoke<void>("voice_speak", { text });
/** Conversation mode on/off. */
export const voiceConverse = (on: boolean) => invoke<void>("voice_converse", { on });
/** Speaks an answer with word progress (lens://voice/speech); resolves with the utterance id. */
export const voiceSay = (text: string) => invoke<number>("voice_say", { text });
export const voiceStopSpeaking = () => invoke<void>("voice_stop_speaking");

/** "Ctrl+Alt+V" → "Ctrl + Alt + V" for display. */
export const prettyKeys = (k: string) =>
  k
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" + ");

/** Accepts what the backend's shortcut parser accepts: modifiers plus one key. */
export function validHotkey(k: string): boolean {
  const parts = k.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  const mods = new Set(["ctrl", "control", "alt", "shift", "super", "win", "cmd", "meta", "option"]);
  const key = parts[parts.length - 1];
  if (mods.has(key)) return false;
  if (!parts.slice(0, -1).every((p) => mods.has(p))) return false;
  return /^([a-z0-9]|f([1-9]|1[0-9]|2[0-4])|space|enter|tab|period|comma|slash|backquote|minus|equal|semicolon|quote|key[a-z]|digit[0-9])$/.test(key);
}
