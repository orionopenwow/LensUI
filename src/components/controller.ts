// Pure helpers for the "Use a controller" card (ControllerCard.tsx) and its tests.
import type { PinnedApp } from "../types/lens";

/** What `thumbdesk_info` returns (src-tauri/src/commands/thumbdesk.rs). */
export interface ThumbDeskStatus {
  version: string;
  connected: boolean;
  controller: string | null;
  runtimeEnabled: boolean;
  guardSuspended: boolean;
  voiceListening: boolean;
}

export interface ThumbDeskInfo {
  installed: boolean;
  path: string | null;
  running: boolean;
  status: ThumbDeskStatus | null;
  pinned: boolean;
}

/** One plain line about ThumbDesk's state for the card. */
export function controllerLine(info: ThumbDeskInfo): string {
  if (!info.installed) return "Not installed.";
  const s = info.status;
  if (!info.running || !s) return "Installed. Not running right now.";
  if (!s.connected) return "Running. No controller connected yet: plug one in or pair it over Bluetooth.";
  const name = s.controller || "Controller";
  if (s.guardSuspended) return `${name} connected. Paused while a protected or Steam game has focus.`;
  if (!s.runtimeEnabled) return `${name} connected. Paused.`;
  if (s.voiceListening) return `${name} connected. Listening for a voice command.`;
  return `${name} connected and driving the desktop.`;
}

/** The Dock pin for Lens's copy of ThumbDesk. */
export function thumbdeskPin(path: string): PinnedApp {
  return { id: "thumbdesk", name: "ThumbDesk", path, iconHint: null };
}
