// Lens Command preferences. Stored as `config.command` once the integrator adds the section
// (docs/COMMAND.md); until then the defaults below apply.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Mode } from "./parse";
import type { TileOverrides } from "./contextProviders";
import { DEFAULT_EDGE, type EdgeSettings } from "./mini/edgeGeometry";
import { quiet } from "../failsafe/calls";

export type CommandProvider = "default" | "script" | "local" | "claude";
export type AutoSource = "selection" | "clipboard" | "window" | "page";

export interface CommandSettings {
  enabled: boolean;
  hotkey: string;
  defaultMode: Mode;
  /** Context offered automatically as chips. Nothing is sent until you press Enter. */
  autoAttach: AutoSource[];
  density: "comfortable" | "compact";
  position: "center" | "top";
  /** Column width in px (480–880). */
  width: number;
  /** Provider override per command id (e.g. { fix: "claude" }). */
  providers: Record<string, CommandProvider>;
  /** Keep the thread when the window closes (in memory only). */
  keepThread: boolean;
  showShelfDrawer: boolean;
  /** Mini: a quick tap of the hotkey opens Mini at the cursor; a second tap expands. */
  miniOnTap: boolean;
  miniTiles: TileOverrides;
  miniCards: MiniCard[];
  edge: EdgeSettings;
  /** Edge tab only appears while something is being dragged. */
  edgeOnlyWhileDragging: boolean;
}

export type MiniCard = "shelf" | "clipboard" | "ai" | "media" | "focus" | "note";
export const MINI_CARDS: { id: MiniCard; label: string }[] = [
  { id: "shelf", label: "Shelf" },
  { id: "clipboard", label: "Clipboard" },
  { id: "ai", label: "AI status" },
  { id: "media", label: "Now playing" },
  { id: "focus", label: "Focus" },
  { id: "note", label: "Quick note" },
];

export const DEFAULT_COMMAND_SETTINGS: CommandSettings = {
  enabled: false,
  hotkey: "Ctrl+Alt+Space",
  defaultMode: "ask",
  autoAttach: ["selection"],
  density: "comfortable",
  position: "center",
  width: 640,
  providers: {},
  keepThread: true,
  showShelfDrawer: false,
  miniOnTap: true,
  miniTiles: {},
  miniCards: ["shelf", "clipboard", "ai", "media", "focus", "note"],
  edge: DEFAULT_EDGE,
  edgeOnlyWhileDragging: false,
};

export function normaliseCommandSettings(raw: unknown): CommandSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CommandSettings>;
  const d = DEFAULT_COMMAND_SETTINGS;
  const width = Number(r.width);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    hotkey: typeof r.hotkey === "string" && r.hotkey.trim() ? r.hotkey : d.hotkey,
    defaultMode: (["ask", "do", "shelf", "clipboard", "actions"] as Mode[]).includes(r.defaultMode as Mode) ? (r.defaultMode as Mode) : d.defaultMode,
    autoAttach: Array.isArray(r.autoAttach)
      ? (r.autoAttach.filter((s) => ["selection", "clipboard", "window", "page"].includes(s)) as AutoSource[])
      : d.autoAttach,
    density: r.density === "compact" ? "compact" : "comfortable",
    position: r.position === "top" ? "top" : "center",
    width: Number.isFinite(width) ? Math.min(880, Math.max(480, Math.round(width / 8) * 8)) : d.width,
    providers: r.providers && typeof r.providers === "object" ? { ...r.providers } : {},
    keepThread: typeof r.keepThread === "boolean" ? r.keepThread : d.keepThread,
    showShelfDrawer: typeof r.showShelfDrawer === "boolean" ? r.showShelfDrawer : d.showShelfDrawer,
    miniOnTap: typeof r.miniOnTap === "boolean" ? r.miniOnTap : d.miniOnTap,
    miniTiles: r.miniTiles && typeof r.miniTiles === "object" ? r.miniTiles : {},
    miniCards: Array.isArray(r.miniCards)
      ? (r.miniCards.filter((c) => ["shelf", "clipboard", "ai", "media", "focus", "note"].includes(c)) as MiniCard[])
      : d.miniCards,
    edge: normaliseEdge(r.edge),
    edgeOnlyWhileDragging: !!r.edgeOnlyWhileDragging,
  };
}

/** Reads `config.command` and follows config changes. */
export function useCommandSettings(): CommandSettings {
  const [s, setS] = useState<CommandSettings>(DEFAULT_COMMAND_SETTINGS);
  useEffect(() => {
    let alive = true;
    const load = () =>
      invoke<Record<string, unknown> | null>("get_config")
        .then((c) => alive && setS(normaliseCommandSettings(c?.command)))
        .catch(quiet);
    load();
    const un = listen("lens://config-updated", load);
    return () => {
      alive = false;
      un.then((u) => u()).catch(quiet);
    };
  }, []);
  return s;
}

function normaliseEdge(raw: unknown): EdgeSettings {
  const e = (raw && typeof raw === "object" ? raw : {}) as Partial<EdgeSettings>;
  const d = DEFAULT_EDGE;
  const num = (v: unknown, lo: number, hi: number, def: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : def);
  return {
    enabled: typeof e.enabled === "boolean" ? e.enabled : d.enabled,
    edge: e.edge === "left" || e.edge === "top" || e.edge === "bottom" ? e.edge : "right",
    offset: num(e.offset, 0, 1, d.offset),
    thickness: num(e.thickness, 4, 16, d.thickness),
    length: num(e.length, 48, 240, d.length),
    panel: { w: num(e.panel?.w, 240, 480, d.panel.w), h: num(e.panel?.h, 280, 720, d.panel.h) },
    hoverMs: num(e.hoverMs, 0, 1500, d.hoverMs),
  };
}
