import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledApp, LensConfig, RunningWindow } from "../types/lens";
import { allPacks, applyThemePack } from "../themes/packs";
import { executeNaturalLanguagePlan, parseNaturalLanguageActions } from "../utils/nlActionRouter";
import { rankItems, specialItems, type RankedItem, type SearchItem } from "./engine";
import { SETTINGS_PAGES } from "./settingsIndex";
import { loadUsage, onUsageLoaded, recordUsage } from "./usage";
import type { CalcResult } from "./calc";
import type * as Gen from "../types/generated";
import { coreAppMatches, coreAppSearchItems } from "../coreapps/registry";

export type FileHit = Gen.FileHit;

interface HomeData {
  recentFiles: { name: string; path: string; ext?: string; ageLabel?: string; isDir?: boolean; folderName?: string }[];
  folders: { name: string; path: string }[];
}

interface UserScript {
  name: string;
  fileName: string;
  path: string;
  ext: string;
}

export interface UnifiedSearchOptions {
  /** Which surface is searching — used as the source tag for the action router. */
  surface: "launcher" | "palette" | "dock";
  /** Called after a result has run (close the surface). */
  onDone: () => void;
  /** Running windows the surface already polls. */
  windows: RunningWindow[];
  config?: LensConfig | null;
  updateConfig?: (next: LensConfig) => Promise<void> | void;
  limit?: number;
}

export interface UnifiedSearch {
  results: RankedItem[];
  /** Key of the item waiting for its confirming second Enter/click. */
  armedKey: string | null;
  /** Runs an item, or arms it first if it needs confirmation. Returns true if it ran. */
  activate: (item: SearchItem) => boolean;
  calc: CalcResult | null;
}

// ---- data shared by every surface in this window ----
let appsCache: InstalledApp[] = [];
let homeCache: HomeData = { recentFiles: [], folders: [] };
let scriptsCache: UserScript[] = [];
let lastLoad = 0;

function refreshSources(force = false): Promise<void> {
  if (!force && Date.now() - lastLoad < 20_000) return Promise.resolve();
  lastLoad = Date.now();
  return Promise.all([
    invoke<InstalledApp[]>("scan_installed_apps_cmd").then((a) => (appsCache = a ?? [])).catch(() => {}),
    invoke<HomeData>("get_launcher_home_cmd")
      .then((h) => (homeCache = { recentFiles: h?.recentFiles ?? [], folders: h?.folders ?? [] }))
      .catch(() => {}),
    invoke<UserScript[]>("list_user_scripts_cmd").then((s) => (scriptsCache = s ?? [])).catch(() => {}),
  ]).then(() => undefined);
}

export function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
  } catch {
    /* fall through */
  }
  fallbackCopy(text);
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* ignore */
  }
  ta.remove();
}

const parentFolder = (p: string) => {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.slice(-2).join("\\");
};

function lensActions(cfg: LensConfig | null | undefined, update: UnifiedSearchOptions["updateConfig"]): SearchItem[] {
  const a = (key: string, title: string, subtitle: string, keywords: string, run: () => unknown): SearchItem => ({
    key: `lens:${key}`,
    kind: "action",
    title,
    subtitle,
    keywords,
    run: () => {
      run();
    },
  });
  const out: SearchItem[] = [
    a("settings", "Lens Control Center", "Lens settings", "settings preferences control center lens", () => invoke("open_surface", { label: "settings" })),
    a("widgets", "Widget Drawer", "Clock, stats and notes", "widgets telemetry notes", () => invoke("toggle_surface", { label: "widgets" })),
    a("overview", "Show all windows", "Overview · Alt+`", "overview windows switcher alt tab mission control", () => invoke("toggle_surface", { label: "overview" })),
    a("quick", "Quick Settings", "Volume, brightness, night light", "quick settings volume brightness", () => invoke("open_quicksettings_tab_cmd", { tab: "quick" })),
    a("notifications", "Notifications", "Notification center", "notifications alerts bell", () => invoke("open_quicksettings_tab_cmd", { tab: "notifications", section: "notifications" })),
    a("tile-split", "Tile windows 50/50", "Window layout", "tile split side by side layout", () => invoke("tile_windows_cmd", { layout: "split" })),
    a("tile-stack", "Tile windows: master and stack", "Window layout", "tile master stack layout", () => invoke("tile_windows_cmd", { layout: "focus-stack" })),
    a("tile-grid", "Tile windows in a grid", "Window layout", "tile grid quad layout", () => invoke("tile_windows_cmd", { layout: "grid" })),
    a("tile-smart", "Smart group windows", "Window layout", "smart group organize tidy", () => invoke("tile_windows_cmd", { layout: "smart-group" })),
    a("desk-next", "Next desktop", "Virtual desktops", "virtual desktop next switch", () => invoke("switch_virtual_desktop_cmd", { direction: "next" })),
    a("desk-prev", "Previous desktop", "Virtual desktops", "virtual desktop previous back switch", () => invoke("switch_virtual_desktop_cmd", { direction: "prev" })),
    a("desk-new", "New desktop", "Virtual desktops", "virtual desktop new create add", () => invoke("switch_virtual_desktop_cmd", { direction: "new" })),
    a("scripts", "Open scripts folder", "Put .bat, .cmd, .ps1 or .py files here to run them from search", "scripts folder automation", () => invoke("open_scripts_folder_cmd")),
    a("reindex", "Rebuild file search index", "Rescans Desktop, Documents, Downloads, Pictures, Music, Videos", "index files rebuild rescan", () => invoke("rebuild_file_index_cmd")),
  ];
  // Lens core apps (Monitor, Timer, Calculator…), docs/CORE_APPS.md.
  out.push(...coreAppSearchItems());
  if (cfg && update) {
    for (const pack of allPacks()) {
      out.push({
        key: `lens:theme:${pack.id}`,
        kind: "action",
        title: `Theme: ${pack.label}`,
        subtitle: `${pack.tier} theme pack`,
        keywords: `theme ${pack.aliases.join(" ")}`,
        run: () => {
          update(applyThemePack(cfg, pack.id));
        },
      });
    }
  }
  return out;
}

/** One search, three surfaces: Launcher, Command Palette and Dock all call this. */
export function useUnifiedSearch(query: string, opts: UnifiedSearchOptions): UnifiedSearch {
  const [, bump] = useState(0);
  const [fileHits, setFileHits] = useState<{ q: string; hits: FileHit[] }>({ q: "", hits: [] });
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const q = query.trim();

  useEffect(() => {
    loadUsage();
    const off = onUsageLoaded(() => bump((n) => n + 1));
    refreshSources(true).then(() => bump((n) => n + 1));
    const onFocus = () => refreshSources().then(() => bump((n) => n + 1));
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => setArmedKey(null), [q]);

  // File index lookups, debounced; stale answers are dropped.
  useEffect(() => {
    if (q.length < 2 || q.startsWith(">") || q.startsWith("?")) {
      setFileHits({ q: "", hits: [] });
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      invoke<FileHit[]>("search_files_cmd", { query: q, limit: 30 })
        .then((hits) => {
          if (alive) setFileHits({ q, hits: hits ?? [] });
        })
        .catch(() => {});
    }, 110);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const handlers = useMemo(
    () => ({
      copy: (text: string) => copyText(text),
      openUrl: (url: string) => {
        invoke("launch_app_cmd", { path: url }).catch(() => {});
      },
      runShell: (command: string) => {
        invoke("run_shell_command_cmd", { command, confirmed: true }).catch(() => {});
      },
    }),
    []
  );

  const { windows, config, updateConfig, surface, limit } = opts;

  const baseItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    const seenWin = new Set<string>();
    for (const w of windows) {
      const k = `${w.processName.toLowerCase()}::${w.title.toLowerCase()}`;
      if (seenWin.has(k)) continue;
      seenWin.add(k);
      const proc = w.processName.replace(/\.exe$/i, "");
      items.push({
        key: `win:${(w.exePath || w.processName).toLowerCase()}:${w.title.toLowerCase().slice(0, 60)}`,
        kind: "window",
        title: w.title || proc,
        subtitle: `${proc} · Open window`,
        keywords: proc,
        iconUrl: w.iconDataUrl,
        path: w.exePath,
        badge: w.isFocused ? "Active" : "Open",
        run: () => {
          invoke("focus_window_cmd", { hwnd: w.hwnd });
        },
      });
    }
    for (const app of appsCache) {
      const folder = app.path.split(/[\\/]/).slice(-2, -1)[0] ?? "";
      items.push({
        key: `app:${app.path.toLowerCase()}`,
        kind: "app",
        title: app.name,
        subtitle: "App",
        keywords: folder.toLowerCase() === "programs" ? undefined : folder,
        path: app.path,
        badge: "App",
        run: () => {
          invoke("launch_app_cmd", { path: app.path });
        },
      });
    }
    for (const f of homeCache.folders) {
      items.push({
        key: `path:${f.path.toLowerCase()}`,
        kind: "folder",
        title: f.name,
        subtitle: f.path,
        path: f.path,
        badge: "Folder",
        run: () => {
          invoke("launch_app_cmd", { path: f.path });
        },
      });
    }
    for (const rf of homeCache.recentFiles) {
      items.push({
        key: `path:${rf.path.toLowerCase()}`,
        kind: rf.isDir ? "folder" : "file",
        title: rf.name,
        subtitle: `Recent · ${rf.folderName || parentFolder(rf.path)}`,
        path: rf.path,
        ext: rf.ext,
        badge: rf.ageLabel || "Recent",
        run: () => {
          invoke("launch_app_cmd", { path: rf.path });
        },
      });
    }
    for (const s of SETTINGS_PAGES) {
      items.push({
        key: `setting:${s.uri}`,
        kind: "setting",
        title: s.title,
        subtitle: "Windows Settings",
        keywords: s.keywords,
        badge: "Settings",
        run: () => {
          invoke("open_windows_setting_cmd", { uri: s.uri });
        },
      });
    }
    for (const sc of scriptsCache) {
      items.push({
        key: `script:${sc.fileName.toLowerCase()}`,
        kind: "script",
        title: sc.name,
        subtitle: `Script · ${sc.fileName}`,
        keywords: `script ${sc.ext}`,
        path: sc.path,
        badge: "Script",
        confirm: `Press Enter again to run ${sc.fileName}`,
        run: () => {
          invoke("run_user_script_cmd", { fileName: sc.fileName, confirmed: true });
        },
      });
    }
    items.push(...lensActions(config, updateConfig));
    return items;
    // appsCache/homeCache/scriptsCache are module caches refreshed with `bump`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows, config, updateConfig, appsCache, homeCache, scriptsCache]);

  const { results, calc } = useMemo(() => {
    if (!q) return { results: [] as RankedItem[], calc: null };
    const special = specialItems(q, handlers);
    if (special.exclusive) {
      return { results: rankItems(q, special.items), calc: null };
    }
    const items: SearchItem[] = [...special.items];

    const nl = parseNaturalLanguageActions(q);
    if (nl.length > 0 && config && updateConfig && !special.calc) {
      items.unshift({
        key: "nl-plan",
        kind: "nl",
        special: "top",
        title: nl.map((a) => a.label).join("  ·  "),
        subtitle: `Action ${nl.length === 1 ? "" : `plan · ${nl.length} steps · `}Enter to run`,
        badge: "Run",
        run: () => executeNaturalLanguagePlan(q, nl, config, updateConfig, surface === "dock" ? "dock-search" : "topbar-search"),
      });
    }

    items.push(...baseItems);
    if (fileHits.q && q.toLowerCase().startsWith(fileHits.q.toLowerCase().slice(0, 2))) {
      for (const h of fileHits.hits) {
        items.push({
          key: `path:${h.path.toLowerCase()}`,
          kind: h.isDir ? "folder" : "file",
          title: h.name,
          subtitle: parentFolder(h.path),
          path: h.path,
          ext: h.ext,
          modified: h.modified,
          badge: h.isDir ? "Folder" : (h.ext || "File").toUpperCase(),
          run: () => {
            invoke("launch_app_cmd", { path: h.path });
          },
        });
      }
    }
    return { results: rankItems(q, items.filter((i) => coreAppMatches(q, i)), { limit: limit ?? 40 }), calc: special.calc };
  }, [q, baseItems, fileHits, handlers, config, updateConfig, surface, limit]);

  const activate = useCallback(
    (item: SearchItem): boolean => {
      if (item.key === "shell-hint") return false;
      if (item.confirm && armedKey !== item.key) {
        setArmedKey(item.key);
        return false;
      }
      setArmedKey(null);
      if (!item.special || item.kind === "nl") recordUsage(item.key, query);
      Promise.resolve()
        .then(() => item.run())
        .catch(() => {});
      optsRef.current.onDone();
      return true;
    },
    [armedKey, query]
  );

  return { results, armedKey, activate, calc };
}
