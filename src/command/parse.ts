// Pure input logic for Lens Command: modes, `/` commands, `@` context mentions, and
// template expansion (mirrors src-tauri/src/shelf/templates.rs). Tested in src/__tests__/command.test.ts.

export const MODES = ["ask", "do", "shelf", "clipboard", "actions"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABEL: Record<Mode, string> = {
  ask: "Ask",
  do: "Do",
  shelf: "Shelf",
  clipboard: "Clipboard",
  actions: "Actions",
};

export function cycleMode(mode: Mode, dir: 1 | -1 = 1, enabled: readonly Mode[] = MODES): Mode {
  const list = MODES.filter((m) => enabled.includes(m));
  if (list.length === 0) return mode;
  const i = list.indexOf(mode);
  if (i < 0) return list[0];
  return list[(i + dir + list.length) % list.length];
}

// ── context mentions ────────────────────────────────────────────────────────────────────────────

export type MentionSource = "selection" | "clipboard" | "window" | "shelf" | "page" | "file";

export const MENTIONS: { source: MentionSource; label: string; hint: string }[] = [
  { source: "selection", label: "Selection", hint: "Text selected in the app you came from" },
  { source: "clipboard", label: "Clipboard", hint: "What you copied last" },
  { source: "window", label: "Window", hint: "Title and app of the window you came from" },
  { source: "shelf", label: "Shelf", hint: "Items you choose from the Shelf" },
  { source: "page", label: "Page", hint: "The page sent from your browser" },
  { source: "file", label: "File", hint: "A file path, e.g. @file:C:\\notes.txt" },
];

export interface Mention {
  source: MentionSource;
  /** `@shelf:s12` → "s12"; `@file:"C:\a b.txt"` → the path. */
  arg?: string;
  raw: string;
}

const MENTION_RE = /(^|\s)@(selection|clipboard|window|shelf|page|file)(?::("[^"]*"|\S+))?(?=\s|$)/gi;

/** Extracts `@source` / `@source:arg` mentions and returns the text without them. */
export function parseMentions(text: string): { mentions: Mention[]; rest: string } {
  const mentions: Mention[] = [];
  const rest = text.replace(MENTION_RE, (raw, lead: string, source: string, arg?: string) => {
    const clean = arg?.startsWith('"') ? arg.slice(1, -1) : arg;
    const m: Mention = { source: source.toLowerCase() as MentionSource, raw: raw.trim() };
    if (clean) m.arg = clean;
    if (!mentions.some((x) => x.source === m.source && x.arg === m.arg)) mentions.push(m);
    return lead;
  });
  return { mentions, rest: rest.replace(/\s{2,}/g, " ").trim() };
}

/** The `@partial` being typed at the caret, for the suggestion popover. */
export function mentionAtCaret(text: string, caret: number): { start: number; partial: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([a-z]*)$/i.exec(before);
  if (!m) return null;
  return { start: caret - m[2].length - 1, partial: m[2].toLowerCase() };
}

export function mentionSuggestions(partial: string) {
  const p = partial.toLowerCase();
  return MENTIONS.filter((m) => m.source.startsWith(p) || m.label.toLowerCase().includes(p));
}

// ── slash commands ──────────────────────────────────────────────────────────────────────────────

export interface CommandTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  provider: string;
  input: string;
  options: string[];
  output: string;
  builtin: boolean;
  enabled: boolean;
}

export interface SlashParse {
  /** The id as typed (may be partial). */
  typed: string;
  /** The resolved command, when the typed id matches one exactly (or uniquely by prefix). */
  command: CommandTemplate | null;
  option?: string;
  lang?: string;
  /** Free text after the command (and its option). */
  args: string;
  /** True while the caret is still inside the command word. */
  completing: boolean;
}

// "to French: text" / "into Brazilian Portuguese, text" (multi-word needs the delimiter) or "to French text".
const LANG_DELIM_RE = /^(?:to|into|in)\s+([A-Za-z][A-Za-z -]{1,30}?)\s*[:,]\s*/i;
const LANG_WORD_RE = /^(?:to|into|in)\s+([A-Za-z]{2,24})\b\s*/i;

export function parseSlash(text: string, commands: CommandTemplate[]): SlashParse | null {
  const m = /^\/([a-z0-9-]*)(\s+([\s\S]*))?$/i.exec(text.trimStart());
  if (!m) return null;
  const typed = m[1].toLowerCase();
  const completing = m[2] === undefined;
  const enabled = commands.filter((c) => c.enabled);
  let command = enabled.find((c) => c.id === typed) ?? null;
  if (!command && typed && !completing) {
    const pref = enabled.filter((c) => c.id.startsWith(typed));
    if (pref.length === 1) command = pref[0];
  }
  let args = (m[3] ?? "").trim();
  let option: string | undefined;
  let lang: string | undefined;
  if (command && args) {
    const lower = args.toLowerCase();
    const opt = [...command.options].sort((a, b) => b.length - a.length).find((o) => lower === o || lower.startsWith(o + " "));
    if (opt) {
      option = opt;
      args = args.slice(opt.length).trim();
    }
    if (command.id === "translate") {
      const l = LANG_DELIM_RE.exec(args) ?? LANG_WORD_RE.exec(args);
      if (l) {
        lang = l[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
        args = args.slice(l[0].length).trim();
      }
    }
  }
  return { typed, command, option, lang, args, completing };
}

/** Ranked suggestions for `/partial`: exact, prefix on id, prefix on name, then substring. */
export function slashSuggestions(typed: string, commands: CommandTemplate[]): CommandTemplate[] {
  const t = typed.toLowerCase();
  const score = (c: CommandTemplate) => {
    if (!t) return 1;
    if (c.id === t) return 4;
    if (c.id.startsWith(t)) return 3;
    if (c.name.toLowerCase().startsWith(t)) return 2;
    if (c.id.includes(t) || c.name.toLowerCase().includes(t) || c.description.toLowerCase().includes(t)) return 1;
    return 0;
  };
  return commands
    .filter((c) => c.enabled)
    .map((c, i) => ({ c, s: score(c), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

// ── template expansion (same rules as the Rust side) ────────────────────────────────────────────

const KNOWN_VARS = new Set(["selection", "clipboard", "shelf", "page", "lang", "input", "title", "url", "date", "option"]);

function splitPipes(s: string): string[] {
  const parts = [""];
  let quoted = false;
  for (const c of s) {
    if (c === '"') {
      quoted = !quoted;
      parts[parts.length - 1] += c;
    } else if (c === "|" && !quoted) parts.push("");
    else parts[parts.length - 1] += c;
  }
  return parts;
}

function applyModifier(value: string, modifier: string): string {
  const m = modifier.trim();
  if (m.startsWith("first:")) {
    const n = Number.parseInt(m.slice(6).trim(), 10);
    const chars = [...value];
    return Number.isFinite(n) && chars.length > n ? chars.slice(0, n).join("") + "\n[…]" : value;
  }
  if (m.startsWith("default:")) return value.trim() ? value : m.slice(8).trim().replace(/^"|"$/g, "");
  switch (m) {
    case "trim": return value.trim();
    case "upper": return value.toUpperCase();
    case "lower": return value.toLowerCase();
    case "oneline": return value.split(/\s+/).filter(Boolean).join(" ");
    default: return value;
  }
}

export function expandTemplate(template: string, vars: Record<string, string | undefined>): string {
  let out = "";
  let rest = template;
  for (;;) {
    const open = rest.indexOf("{");
    if (open < 0) return out + rest;
    out += rest.slice(0, open);
    const after = rest.slice(open + 1);
    const close = after.indexOf("}");
    if (close < 0) return out + rest.slice(open);
    const inner = after.slice(0, close);
    const parts = splitPipes(inner);
    const name = parts.shift()!.trim();
    const known = KNOWN_VARS.has(name) || name in vars;
    if (!name || !known || /\s/.test(name)) out += `{${inner}}`;
    else out += parts.reduce((v, mod) => applyModifier(v, mod), vars[name] ?? "");
    rest = after.slice(close + 1);
  }
}

// ── providers ───────────────────────────────────────────────────────────────────────────────────

export type Destination = "Local" | "Claude" | "Script";

/** Where a request goes, in plain words for the chips. */
export function destinationOf(providerKind: string | undefined): Destination {
  if (providerKind === "claude") return "Claude";
  if (providerKind === "script") return "Script";
  return "Local";
}

/** A local-only item must never ride along to a cloud provider. */
export function chipBlocked(localOnly: boolean, dest: Destination): boolean {
  return localOnly && dest === "Claude";
}
