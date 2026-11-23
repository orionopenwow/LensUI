// App-aware context: the same category table as src-tauri/src/clip/appctx.rs, plus the Mini tile
// set for each category and the user's per-app overrides. Pure; tested in command.test.ts.

export type AppCategory = "code" | "explorer" | "browser" | "office" | "notes" | "terminal" | "chat" | "lens" | "other";

const TABLE: [string[], AppCategory][] = [
  [["code.exe", "code - insiders.exe", "cursor.exe", "devenv.exe", "rider64.exe", "idea64.exe", "pycharm64.exe", "webstorm64.exe", "clion64.exe", "goland64.exe", "sublime_text.exe", "notepad++.exe", "zed.exe", "windsurf.exe", "fleet.exe"], "code"],
  [["explorer.exe"], "explorer"],
  [["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe", "zen.exe", "librewolf.exe", "thorium.exe"], "browser"],
  [["winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe", "olk.exe", "soffice.bin", "swriter.exe", "wps.exe"], "office"],
  [["notepad.exe", "obsidian.exe", "notion.exe", "logseq.exe", "joplin.exe", "typora.exe", "evernote.exe", "wordpad.exe"], "notes"],
  [["windowsterminal.exe", "wt.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "conhost.exe", "wezterm-gui.exe", "alacritty.exe", "mintty.exe", "tabby.exe", "warp.exe", "openconsole.exe"], "terminal"],
  [["slack.exe", "discord.exe", "teams.exe", "ms-teams.exe", "telegram.exe", "whatsapp.exe", "signal.exe", "zoom.exe"], "chat"],
  [["lens-ui.exe", "lens ui.exe", "lensui.exe"], "lens"],
];

export const fileName = (path: string) => (path.split(/[\\/]/).pop() ?? path).trim().toLowerCase();

export function categorize(process: string): AppCategory {
  const name = fileName(process);
  return TABLE.find(([names]) => names.includes(name))?.[1] ?? "other";
}

/** Built-in tiles that are not templates. */
export const SPECIAL_TILES = ["ask", "shelf-add", "explain-error", "review"] as const;

export const DEFAULT_TILES: Record<AppCategory, string[]> = {
  code: ["explain", "review", "fix", "ask", "shelf-add", "summarise"],
  explorer: ["summarise", "ask", "shelf-add", "transcribe", "extract", "compare"],
  browser: ["summarise", "ask-page", "explain", "translate", "shelf-add", "extract"],
  office: ["rewrite", "summarise", "fix", "translate", "todo", "shelf-add"],
  notes: ["rewrite", "summarise", "fix", "translate", "todo", "shelf-add"],
  terminal: ["explain-error", "explain", "ask", "shelf-add", "fix", "summarise"],
  chat: ["rewrite", "summarise", "translate", "todo", "ask", "shelf-add"],
  lens: ["summarise", "explain", "translate", "rewrite", "ask", "shelf-add"],
  other: ["summarise", "explain", "translate", "rewrite", "ask", "shelf-add"],
};

export const CATEGORY_LABEL: Record<AppCategory, string> = {
  code: "Code editor",
  explorer: "File Explorer",
  browser: "Browser",
  office: "Office",
  notes: "Notes",
  terminal: "Terminal",
  chat: "Chat",
  lens: "Lens",
  other: "App",
};

/** What a category attaches by default (offered as chips, never sent until Enter). */
export const DEFAULT_CONTEXT: Record<AppCategory, string> = {
  code: "Selected code",
  explorer: "Selected files",
  browser: "Page from the Lens extension",
  office: "Selected text",
  notes: "Selected text",
  terminal: "Selected output (never the whole scrollback)",
  chat: "Selected message",
  lens: "Nothing",
  other: "Selected text",
};

export interface TileOverrides {
  /** Per-app (exe name) tile lists, then per-category, then Lens defaults. */
  apps?: Record<string, string[]>;
  categories?: Partial<Record<AppCategory, string[]>>;
  /** The user's general tile set (replaces the "other" defaults). */
  base?: string[];
}

/** The six tiles for this app. Unknown ids are dropped; the list is padded from the defaults. */
export function tilesFor(process: string, overrides: TileOverrides = {}, known?: Set<string>): string[] {
  const cat = categorize(process);
  const chosen =
    overrides.apps?.[fileName(process)] ??
    overrides.categories?.[cat] ??
    (cat === "other" || cat === "lens" ? overrides.base : undefined) ??
    DEFAULT_TILES[cat];
  const ok = (id: string) => !known || known.has(id) || (SPECIAL_TILES as readonly string[]).includes(id);
  const out: string[] = [];
  for (const id of [...chosen, ...DEFAULT_TILES[cat], ...DEFAULT_TILES.other]) {
    if (out.length === 6) break;
    if (ok(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Moves a tile from one slot to another (drag to reorder). */
export function moveTile(tiles: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= tiles.length) return tiles;
  const next = [...tiles];
  const [t] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, t);
  return next;
}

/** Prompts for the special tiles that are not user templates. */
export const SPECIAL_PROMPTS: Record<string, { name: string; template: string }> = {
  review: {
    name: "Review",
    template: "Review this code: bugs first, then risky edge cases, then small improvements. Be brief and specific.\n\n{selection | first:24000}",
  },
  "explain-error": {
    name: "Explain error",
    template: "Explain this terminal output: what failed, the most likely cause, and the command to fix it.\n\n{selection | first:16000}",
  },
};
