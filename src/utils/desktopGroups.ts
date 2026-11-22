/**
 * Desktop groups ("fences"): named, collapsible views over desktop items.
 *
 * Groups are only a view. Nothing here moves, renames or deletes a file: membership is a list of
 * paths plus optional type rules, saved in config.desktopGroups. Removing a group just stops
 * showing that view; the files stay on the desktop exactly where they were.
 */

export interface DesktopItemLike {
  name: string;
  path: string;
  isDir: boolean;
  ext: string;
  isShortcut: boolean;
}

/** Built-in type rules a group can auto-collect. */
export type DesktopRule =
  | "folders"
  | "shortcuts"
  | "images"
  | "documents"
  | "code"
  | "archives"
  | "media"
  | "installers";

export const DESKTOP_RULES: { id: DesktopRule; label: string; exts?: string[] }[] = [
  { id: "folders", label: "Folders" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "images", label: "Images", exts: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "avif", "psd", "ico"] },
  {
    id: "documents",
    label: "Documents",
    exts: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "csv", "md", "pages", "key"],
  },
  {
    id: "code",
    label: "Code",
    exts: ["ts", "tsx", "js", "jsx", "rs", "py", "json", "css", "html", "bat", "ps1", "sh", "c", "cpp", "h", "cs", "java", "go", "toml", "yml", "yaml"],
  },
  { id: "archives", label: "Archives", exts: ["zip", "rar", "7z", "tar", "gz", "iso"] },
  { id: "media", label: "Audio & Video", exts: ["mp3", "wav", "flac", "m4a", "ogg", "mp4", "mkv", "mov", "avi", "webm"] },
  { id: "installers", label: "Installers", exts: ["exe", "msi", "msix", "appx"] },
];

export interface DesktopGroup {
  id: string;
  name: string;
  /** Accent for the group header dot (any CSS colour). */
  color: string;
  collapsed: boolean;
  /** Type rules: items matching any rule join this group unless placed elsewhere by hand. */
  rules: DesktopRule[];
  /** Items placed here by hand (absolute paths). Hand placement always wins over rules. */
  paths: string[];
}

export interface DesktopGroupsConfig {
  groups: DesktopGroup[];
  /** Sort new desktop items into groups by their rules. */
  autoSort: boolean;
  /** Show the "Everything else" section for items no group claims. */
  showUnsorted: boolean;
}

export const UNSORTED_ID = "__unsorted";

export const DEFAULT_DESKTOP_GROUPS: DesktopGroupsConfig = {
  autoSort: true,
  showUnsorted: true,
  groups: [
    { id: "g-apps", name: "Apps", color: "#60A5FA", collapsed: false, rules: ["shortcuts", "installers"], paths: [] },
    { id: "g-folders", name: "Folders", color: "#38BDF8", collapsed: false, rules: ["folders"], paths: [] },
    { id: "g-docs", name: "Documents", color: "#A78BFA", collapsed: false, rules: ["documents", "code"], paths: [] },
    { id: "g-media", name: "Media", color: "#34D399", collapsed: true, rules: ["images", "media"], paths: [] },
  ],
};

const RULE_IDS = new Set<string>(DESKTOP_RULES.map((r) => r.id));

export function ruleMatches(rule: DesktopRule, item: DesktopItemLike): boolean {
  if (rule === "folders") return item.isDir;
  if (rule === "shortcuts") return item.isShortcut;
  if (item.isDir || item.isShortcut) return false;
  const def = DESKTOP_RULES.find((r) => r.id === rule);
  return !!def?.exts?.includes(item.ext.toLowerCase());
}

const sameP = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Validates whatever is stored in config (it may be missing, old or hand-edited). */
export function readDesktopGroups(raw: unknown): DesktopGroupsConfig {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(DEFAULT_DESKTOP_GROUPS);
  const r = raw as Record<string, unknown>;
  const groups: DesktopGroup[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.groups)) {
    for (const g of r.groups.slice(0, 24)) {
      if (!g || typeof g !== "object") continue;
      const o = g as Record<string, unknown>;
      let id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : "";
      if (!id || seen.has(id) || id === UNSORTED_ID) id = `g-${groups.length}-${Math.random().toString(36).slice(2, 7)}`;
      seen.add(id);
      groups.push({
        id,
        name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : "Group",
        color: typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : "#60A5FA",
        collapsed: o.collapsed === true,
        rules: Array.isArray(o.rules) ? (o.rules.filter((x) => typeof x === "string" && RULE_IDS.has(x)) as DesktopRule[]) : [],
        paths: Array.isArray(o.paths)
          ? (o.paths.filter((x) => typeof x === "string" && x.length < 1024) as string[]).slice(0, 500)
          : [],
      });
    }
  } else {
    return structuredCloneSafe(DEFAULT_DESKTOP_GROUPS);
  }
  return {
    groups,
    autoSort: r.autoSort !== false,
    showUnsorted: r.showUnsorted !== false,
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export interface ArrangedGroup {
  group: DesktopGroup;
  items: DesktopItemLike[];
}

/**
 * Places every desktop item in exactly one section: a group that holds it by hand first, then
 * (when autoSort is on) the first group whose rules match, otherwise "Everything else".
 * Paths held by hand that no longer exist on the desktop are simply not shown.
 */
export function arrangeDesktop(items: DesktopItemLike[], cfg: DesktopGroupsConfig): ArrangedGroup[] {
  const out: ArrangedGroup[] = cfg.groups.map((g) => ({ group: g, items: [] }));
  const unsorted: DesktopItemLike[] = [];
  for (const item of items) {
    let idx = cfg.groups.findIndex((g) => g.paths.some((p) => sameP(p, item.path)));
    if (idx < 0 && cfg.autoSort) idx = cfg.groups.findIndex((g) => g.rules.some((r) => ruleMatches(r, item)));
    if (idx >= 0) out[idx].items.push(item);
    else unsorted.push(item);
  }
  if (cfg.showUnsorted && unsorted.length > 0) {
    out.push({
      group: { id: UNSORTED_ID, name: "Everything else", color: "#A1A1AA", collapsed: false, rules: [], paths: [] },
      items: unsorted,
    });
  }
  return out;
}

/** Moves an item into a group by hand (or back to automatic placement with groupId = null). */
export function placeItem(cfg: DesktopGroupsConfig, path: string, groupId: string | null): DesktopGroupsConfig {
  return {
    ...cfg,
    groups: cfg.groups.map((g) => {
      const without = g.paths.filter((p) => !sameP(p, path));
      return g.id === groupId ? { ...g, paths: [...without, path] } : { ...g, paths: without };
    }),
  };
}

export function setCollapsed(cfg: DesktopGroupsConfig, groupId: string, collapsed: boolean): DesktopGroupsConfig {
  return { ...cfg, groups: cfg.groups.map((g) => (g.id === groupId ? { ...g, collapsed } : g)) };
}

export function setAllCollapsed(cfg: DesktopGroupsConfig, collapsed: boolean): DesktopGroupsConfig {
  return { ...cfg, groups: cfg.groups.map((g) => ({ ...g, collapsed })) };
}

export function newGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
