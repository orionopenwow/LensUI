// Pure logic for the magic window: what's under the cursor → which actions → which request.
// No React and no Tauri here, so it's covered by bun tests.
import { CATALOG, menuFor, type ActionDef, type ContextKind, type MenuContext, type MenuPrefs, type UsageCounts, DEFAULT_PREFS } from "../context/actions";
import type { AiContext, AiRequest } from "../ai/contract";
import type { MagicConfig, MagicTarget } from "./contract";

export type Mode = "do" | "ask";

/** One row in the list: a catalogue action, or a window action. */
export interface Row {
  id: string;
  label: string;
  icon: string;
  group: "ai" | "save" | "copy" | "media" | "lens" | "window" | "custom";
  /** Shown as a small mono caption ("local", "claude", "confirm"). */
  hint?: string;
  risk: "low" | "confirm";
  /** Catalogue action (absent for window actions). */
  action?: ActionDef;
  /** Window action verb for `magic_window_action`, e.g. "snap:left". */
  windowAction?: string;
}

export interface Caps {
  /** Lens Snip is installed (feature/lens-snip). */
  snip: boolean;
  /** Lens Browser is installed (feature/lens-browser). */
  browser: boolean;
  /** Desktop widgets are on (magicWaves.desktopWidgets): the desktop gets "Edit widgets…". */
  desktopWidgets?: boolean;
}

/** Rows for the desktop itself (right-click on the bare desktop). */
export function desktopRows(t: MagicTarget, caps: Caps = NO_CAPS): Row[] {
  if (t.kind !== "desktop" || !caps.desktopWidgets) return [];
  return [{ id: "desk:widgets", label: "Edit widgets…", icon: "layout-grid", group: "lens", risk: "low", windowAction: "desktop-widgets" }];
}

export const NO_CAPS: Caps = { snip: false, browser: false };

const KIND_LABEL: Record<string, string> = {
  selection: "Selection", link: "Link", image: "Image", file: "File", folder: "Folder", listItem: "Item",
  window: "Window", app: "App", desktop: "Desktop", dockItem: "Dock", shelfItem: "Shelf", notification: "Notification",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? "Item";
}

/** Status dot tone: green = readable/known, amber = partly (admin, unknown url), grey = Lens/desktop. */
export function toneOf(t: MagicTarget): "ok" | "warn" | "quiet" {
  if (t.kind === "desktop" || t.kind === "dockItem" || t.kind === "shelfItem" || t.kind === "notification") return "quiet";
  if (t.detail === "admin") return "warn";
  if (t.kind === "link" && !t.url) return "warn";
  return "ok";
}

export function isYouTube(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\./, "");
    return h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com";
  } catch {
    return false;
  }
}

const BROWSERS = ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe"];
export function isBrowserApp(app: string): boolean {
  return BROWSERS.includes(app.toLowerCase());
}

/** Catalogue context for a target. */
export function menuContextFor(t: MagicTarget): MenuContext {
  const kind: ContextKind = (() => {
    switch (t.kind) {
      case "selection":
      case "listItem":
        return "selection";
      case "link":
        return isYouTube(t.url) ? "youtube" : "link";
      case "image":
        return "image";
      case "file":
        return "file";
      case "folder":
        return "folder";
      case "window":
        return "window";
      case "app":
      case "dockItem":
        return "app";
      case "shelfItem":
        return "shelf";
      case "notification":
        return "notification";
      default:
        return "desktop";
    }
  })();
  return { kind, path: t.path ?? undefined };
}

/** Window actions for window/app targets (undoable from the same window, except Close). */
export function windowRows(t: MagicTarget, caps: Caps = NO_CAPS): Row[] {
  if ((t.kind !== "window" && t.kind !== "app" && t.kind !== "dockItem") || t.window == null) return [];
  const w = (id: string, label: string, icon: string, windowAction: string, risk: Row["risk"] = "low"): Row => ({
    id: `win:${id}`, label, icon, group: "window", risk, windowAction,
  });
  const rows: Row[] = [
    w("minimize", "Minimise", "minus", "minimize"),
    w("maximize", "Maximise or restore", "maximize", "maximize"),
    w("snap-left", "Snap left", "panel-left", "snap:left"),
    w("snap-right", "Snap right", "panel-right", "snap:right"),
    w("monitor", "Move to next monitor", "monitor", "monitor:next"),
    w("workspace", "Move to workspace…", "layers", "workspace"),
    w("pin", "Pin on top", "pin", "pin"),
    w("rule", "Style this window… (opacity, border)", "palette", "rule"),
  ];
  if (caps.snip) rows.push(w("snip", "Snip this window", "scissors", "snip"));
  rows.push({ id: "win:shelf", label: "Add window to Shelf", icon: "bookmark-plus", group: "window", risk: "low", windowAction: "shelf" });
  if (caps.browser && isBrowserApp(t.app)) rows.push(w("browser", "Open in Lens Browser", "globe", "browser"));
  rows.push(w("tips", `Tips for ${appName(t)}`, "lightbulb", "tips"));
  rows.push(w("close", "Close window…", "x", "close", "confirm"));
  return rows;
}

export function appName(t: MagicTarget): string {
  const a = t.app.replace(/\.exe$/i, "");
  return a || t.label;
}

function rowFromAction(a: ActionDef): Row {
  const hint = a.risk === "confirm" ? "asks first" : a.provider === "claude" ? "claude" : a.provider === "local" ? "local" : undefined;
  return { id: a.id, label: a.label, icon: a.icon, group: (a.group as Row["group"]) ?? "ai", hint, risk: a.risk, action: a };
}

export interface RowSet {
  top: Row[];
  more: Row[];
}

/**
 * Rows for a target. Catalogue actions keep the user's order/pins/hidden from the right-click
 * settings; "learn" (magic window setting) floats frequent ones up. AI actions are left out when
 * AI is off for this window. Window actions follow the catalogue ones for window targets.
 */
export function rowsFor(
  t: MagicTarget,
  cfg: Pick<MagicConfig, "ai" | "windowActions" | "maxRows" | "learn">,
  prefs: MenuPrefs = DEFAULT_PREFS,
  usage: UsageCounts = {},
  caps: Caps = NO_CAPS,
): RowSet {
  const ctx = menuContextFor(t);
  const m = menuFor(ctx, { ...prefs, learn: cfg.learn }, usage, CATALOG);
  const fromCatalog = [...m.top, ...m.more]
    .filter((a) => cfg.ai || (a.group !== "ai" && a.provider !== "claude" && a.provider !== "local"))
    .filter((a) => a.id !== "command_open") // the footer already has "Expand to Command"
    .map(rowFromAction);
  const win = cfg.windowActions ? windowRows(t, caps) : [];
  // For a window, the window's own actions come first: that's why people right-click a window.
  const all = t.kind === "window" ? [...win, ...fromCatalog] : [...desktopRows(t, caps), ...fromCatalog, ...win];
  const max = Math.max(3, Math.min(9, cfg.maxRows || 7));
  return { top: all.slice(0, max), more: all.slice(max) };
}

/** Type-to-filter: every word must match the label or group. */
export function filterRows(rows: Row[], query: string): Row[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => words.every((w) => r.label.toLowerCase().includes(w) || r.group.includes(w)));
}

// ---- keyboard -----------------------------------------------------------------------------------

export interface KeyState {
  mode: Mode;
  query: string;
  index: number;
  showMore: boolean;
  target: number;
}

export type KeyResult =
  | { type: "state"; state: KeyState }
  | { type: "run"; state: KeyState; row: Row }
  | { type: "ask"; state: KeyState; question: string }
  | { type: "close" }
  | { type: "none" };

export function initialKeys(mode: Mode): KeyState {
  return { mode, query: "", index: 0, showMore: false, target: 0 };
}

/** Visible rows for the current state (filtered; "More" folded unless opened or filtering). */
export function visibleRows(set: RowSet, s: KeyState): Row[] {
  const all = s.showMore || s.query ? [...set.top, ...set.more] : set.top;
  return filterRows(all, s.query);
}

/**
 * Keyboard model. Do mode: ↑↓ move, Enter runs, 1–9 run, ←→ switch target (input empty),
 * Tab → Ask. Ask mode: Enter asks, Tab → Do. Esc clears the input first, then closes.
 */
export function onKey(s: KeyState, key: string, set: RowSet, targets: number): KeyResult {
  const rows = visibleRows(set, s);
  const st = (p: Partial<KeyState>): KeyResult => ({ type: "state", state: { ...s, ...p } });
  switch (key) {
    case "Escape":
      return s.query ? st({ query: "", index: 0 }) : { type: "close" };
    case "Tab":
      return st({ mode: s.mode === "do" ? "ask" : "do", index: 0 });
    case "ArrowDown":
      if (s.mode !== "do" || !rows.length) return { type: "none" };
      return st({ index: (s.index + 1) % rows.length });
    case "ArrowUp":
      if (s.mode !== "do" || !rows.length) return { type: "none" };
      return st({ index: (s.index - 1 + rows.length) % rows.length });
    case "ArrowRight":
    case "ArrowLeft":
      if (s.query || targets < 2) return { type: "none" };
      return st({ target: (s.target + (key === "ArrowRight" ? 1 : targets - 1)) % targets, index: 0, showMore: false });
    case "Enter":
      if (s.mode === "ask") return s.query.trim() ? { type: "ask", state: s, question: s.query.trim() } : { type: "none" };
      if (!rows.length) return s.query.trim() ? { type: "ask", state: { ...s, mode: "ask" }, question: s.query.trim() } : { type: "none" };
      return { type: "run", state: s, row: rows[Math.min(s.index, rows.length - 1)] };
    default:
      if (s.mode === "do" && !s.query && /^[1-9]$/.test(key)) {
        const row = rows[Number(key) - 1];
        return row ? { type: "run", state: s, row } : { type: "none" };
      }
      return { type: "none" };
  }
}

// ---- requests -------------------------------------------------------------------------------------

/** The instruction each catalogue action sends with the item (shared with the selection bar's
 *  answers in Magic Search). */
export const PROMPTS: Record<string, string> = {
  ask: "Answer the question about this.",
  define: "Define this word or term in one or two short sentences, then give one example sentence.",
  summarize: "Summarise this as a short TL;DR and 3–5 key points.",
  explain: "Explain this simply, with one example.",
  translate: "Translate this into English (or into the user's language if it is already English).",
  rewrite: "Rewrite this to be shorter and clearer. Keep the meaning.",
  fix_grammar: "Fix spelling and grammar. Change nothing else. Return only the corrected text.",
  extract: "Extract the links, dates, people and to-dos as short lists.",
  ask_files: "Describe these files and what they are for.",
  send_claude: "Help with this.",
};

/** The AI context fields a target contributes (only what the user can see in its chip). */
export function contextFor(t: MagicTarget): AiContext {
  const c: AiContext = {};
  if (t.kind === "selection" || t.kind === "listItem") c.selection = t.text ?? t.label;
  if (t.url) c.url = t.url;
  if ((t.kind === "file" || t.kind === "folder") && t.path) c.files = [t.path];
  if (t.kind === "window") c.window_title = t.label;
  if (t.app) c.app_name = t.app.replace(/\.exe$/i, "");
  if (t.kind === "link" && !t.url) c.selection = t.label;
  if (t.kind === "image") c.selection = `Image: ${t.label}`;
  if (t.kind === "shelfItem") c.shelf_text = t.label;
  return c;
}

/** What gets attached, in words, for the chip strip and the consent line. */
export function attachedSummary(t: MagicTarget): string[] {
  const c = contextFor(t);
  const out: string[] = [];
  if (c.selection) out.push(t.kind === "selection" ? `${t.detail || "selection"}` : "label");
  if (c.url) out.push("link");
  if (c.files?.length) out.push("file path");
  if (c.window_title) out.push("window title");
  if (c.app_name) out.push("app name");
  if (c.shelf_text) out.push("Shelf item");
  return out;
}

export function buildRequest(t: MagicTarget, opts: { actionId?: string; question?: string }): AiRequest {
  const base = opts.actionId ? PROMPTS[opts.actionId] ?? "Help with this." : "";
  const prompt = [base, opts.question].filter(Boolean).join("\n\n") || "Help with this.";
  const provider = opts.actionId === "send_claude" ? "claude" : undefined;
  return { prompt, context: contextFor(t), ...(provider ? { provider } : {}), allow_tools: !opts.actionId } as AiRequest;
}

/** Text to copy for "Copy as Markdown" / copy actions. */
export function markdownFor(t: MagicTarget): string {
  if (t.url) return `[${t.label.replace(/[[\]]/g, "")}](${t.url})`;
  if (t.path) return `\`${t.path}\``;
  return t.text ?? t.label;
}

/** Which actions the surface can run itself without the AI (and how). */
export function localKind(row: Row): "window" | "copy" | "shelf" | "command" | "media" | "search" | "ai" {
  if (row.windowAction) return "window";
  const id = row.action?.id ?? "";
  if (id === "magic_search") return "search";
  if (id === "copy_md") return "copy";
  if (id === "micro_save" || id === "shelf_add") return "shelf";
  if (id === "transcribe" || id === "yt_transcript") return "media";
  if (["command_open", "command_here", "context_add", "pack_add", "compare"].includes(id)) return "command";
  return "ai";
}

/** Milliseconds from the trigger to first paint, clamped for the status line. */
export function openLatency(atMs: number, now: number): number {
  return Math.max(0, Math.min(60_000, Math.round(now - atMs)));
}
