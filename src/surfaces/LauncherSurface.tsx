import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlyoutClose } from "../ui/FlyoutClose";
import { invoke } from "@tauri-apps/api/core";
import { hideSurface } from "../failsafe/calls";
import { listen } from "@tauri-apps/api/event";
import { ackKeyhook, type KeyhookMessage } from "../shell/keyhookResponder";
import {
  Search,
  Power,
  Lock,
  Moon,
  RotateCcw,
  LogOut,
  Pin,
  ShieldCheck,
  Folder,
  FileText,
  AppWindow,
  CornerDownLeft,
} from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import { useUnifiedSearch } from "../search/useUnifiedSearch";
import { LazyPathIcon, ResultIcon, resultBadge } from "../search/ResultIcon";
import type { InstalledApp, PinnedApp } from "../types/lens";
import "./LauncherSurface.css";

/**
 * Lens Launcher — the Start-menu replacement.
 * Every installed app in a filterable grid, pinned apps and recent files on top, power controls below.
 * Type anywhere to filter; arrows move, Enter opens, Esc closes.
 */

interface RecentFileItem {
  name: string;
  path: string;
  ext: string;
  ageLabel: string;
  sizeLabel: string;
  folderName: string;
  isDir: boolean;
}

interface LauncherHomeData {
  recentFiles: RecentFileItem[];
  folders: { name: string; path: string; color: string; itemCount: number }[];
}

type PowerAction = "lock" | "sleep" | "restart" | "shutdown" | "signout";

const POWER_ACTIONS: { id: PowerAction; label: string; confirm: string; icon: React.ReactNode }[] = [
  { id: "lock", label: "Lock", confirm: "Lock now?", icon: <Lock size={14} strokeWidth={2.4} /> },
  { id: "sleep", label: "Sleep", confirm: "Sleep now?", icon: <Moon size={14} strokeWidth={2.4} /> },
  { id: "signout", label: "Sign out", confirm: "Sign out?", icon: <LogOut size={14} strokeWidth={2.4} /> },
  { id: "restart", label: "Restart", confirm: "Restart PC?", icon: <RotateCcw size={14} strokeWidth={2.4} /> },
  { id: "shutdown", label: "Shut down", confirm: "Shut down PC?", icon: <Power size={14} strokeWidth={2.4} /> },
];

const GRID_COLS = 6;
const ALL = "All";

/** Full-color app icon (shared cache with every other search surface). */
const LazyIcon: React.FC<{ path: string; size: number; fallback?: React.ReactNode }> = ({ path, size, fallback }) => (
  <LazyPathIcon
    path={path}
    size={size}
    className="ln-icon"
    fallback={fallback ?? <AppWindow size={Math.round(size * 0.6)} strokeWidth={2} />}
  />
);

/** Start Menu sub-folder the shortcut lives in ("Programs\Adobe\x.lnk" -> "Adobe"). */
function groupOf(app: InstalledApp): string {
  const parts = app.path.split(/[\\/]/);
  const idx = parts.map((p) => p.toLowerCase()).lastIndexOf("programs");
  if (idx >= 0 && parts.length - idx > 2) return parts[idx + 1];
  return "Apps";
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface MenuState {
  x: number;
  y: number;
  name: string;
  path: string;
}

export const LauncherSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  const glidePhase = useSurfaceGlide("launcher");

  // Win-key tap (keyboard hook): the backend toggles this window; acknowledging tells the hook
  // Lens is responsive, otherwise it hands the key back to Windows' Start after 300 ms.
  useEffect(() => {
    const un = listen<KeyhookMessage>("lens://keyhook", (e) => {
      if (e.payload?.event?.kind === "launcherToggle") ackKeyhook(e.payload.seq);
    });
    return () => {
      un.then((fn) => fn());
    };
  }, []);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [home, setHome] = useState<LauncherHomeData>({ recentFiles: [], folders: [] });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [selected, setSelected] = useState(0);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [armed, setArmed] = useState<PowerAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const armTimer = useRef<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const windows = useRunningWindows(1500);

  const hide = useCallback(() => {
    setMenu(null);
    void hideSurface("launcher");
  }, []);

  const refresh = useCallback(() => {
    invoke<InstalledApp[]>("scan_installed_apps_cmd")
      .then((list) => setApps([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
    invoke<LauncherHomeData>("get_launcher_home_cmd")
      .then(setHome)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const reset = () => {
      setQuery("");
      setCategory(ALL);
      setSelected(0);
      setMenu(null);
      setArmed(null);
      setStatus(null);
      refresh();
      window.setTimeout(() => inputRef.current?.focus(), 25);
    };
    reset();
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) hide();
      }, 150);
    };
    window.addEventListener("focus", reset);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", reset);
      window.removeEventListener("blur", onBlur);
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    };
  }, [hide, refresh]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of apps) {
      const g = groupOf(a);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const named = [...counts.entries()]
      .filter(([g, n]) => g !== "Apps" && n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([g]) => g);
    return [ALL, ...named];
  }, [apps]);

  const searching = query.trim() !== "";

  // Typing switches from the app grid to ranked results across apps, windows, files, settings,
  // Lens actions, scripts, the calculator and the action router (same engine as Palette and Dock).
  const search = useUnifiedSearch(query, {
    surface: "launcher",
    onDone: () => hide(),
    windows,
    config,
    updateConfig,
    limit: 40,
  });
  const results = search.results;

  const filtered = useMemo(
    () => apps.filter((a) => category === ALL || groupOf(a) === category),
    [apps, category]
  );

  const navCount = searching ? results.length : filtered.length;
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, navCount - 1)));
  }, [navCount]);

  useEffect(() => {
    (searching ? resultsRef : gridRef).current
      ?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, searching]);

  const launch = useCallback(
    (path: string, mode?: "admin" | "reveal") => {
      const call = mode
        ? invoke("launch_app_advanced_cmd", { path, mode })
        : invoke("launch_app_cmd", { path });
      call.catch((e) => setStatus(`Couldn't open: ${String(e)}`));
      if (mode !== "reveal") hide();
      setMenu(null);
    },
    [hide]
  );

  const pinned: PinnedApp[] = config?.dock.pinnedApps ?? [];
  const isPinned = (path: string) => pinned.some((p) => p.path.toLowerCase() === path.toLowerCase());

  const togglePin = (name: string, path: string) => {
    if (!config) return;
    const next = isPinned(path)
      ? pinned.filter((p) => p.path.toLowerCase() !== path.toLowerCase())
      : [...pinned, { id: `launcher-${slug(name)}-${Date.now().toString(36)}`, name, path, iconHint: null }];
    updateConfig({ ...config, dock: { ...config.dock, pinnedApps: next } });
    setMenu(null);
  };

  const openMenu = (e: React.MouseEvent, name: string, path: string) => {
    e.preventDefault();
    // Keep the menu inside the window
    const x = Math.min(e.clientX, window.innerWidth - 216);
    const y = Math.min(e.clientY, window.innerHeight - 176);
    setMenu({ x, y, name, path });
  };

  const runPower = (action: PowerAction) => {
    if (armed !== action) {
      // First click arms, second click within 4 s commits.
      setArmed(action);
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(null), 4000);
      return;
    }
    setArmed(null);
    invoke("power_action_cmd", { action })
      .then(() => hide())
      .catch((e) => setStatus(`Couldn't ${action}: ${String(e)}`));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (menu) setMenu(null);
      else if (query) setQuery("");
      else hide();
      return;
    }
    if (searching) {
      const lastR = Math.max(0, results.length - 1);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(lastR, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[selected];
        if (!item) return;
        if (e.ctrlKey && e.shiftKey && item.kind === "app" && item.path) launch(item.path, "admin");
        else search.activate(item);
      }
      return;
    }
    const last = Math.max(0, filtered.length - 1);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setSelected((s) => Math.min(last, s + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(last, s + GRID_COLS));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - GRID_COLS));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelected(last);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const app = filtered[selected];
      if (app) launch(app.path, e.ctrlKey && e.shiftKey ? "admin" : undefined);
    }
  };

  const showHome = query.trim() === "" && category === ALL;
  const recent = home.recentFiles.slice(0, 6);

  return (
    <div className="ln-root" onKeyDown={onKeyDown} onClick={() => setMenu(null)}>
      <div className={`ln-shell lens-flyout-host lens-glide-dock ${glidePhase}`}>
        <FlyoutClose onClose={() => void hideSurface("launcher")} />
        <div className="ln-search">
          <Search size={16} strokeWidth={2.55} />
          <input
            ref={inputRef}
            className="ln-search-input"
            value={query}
            aria-label="Search apps, files and settings"
            placeholder="Search apps, files, settings…   = math   > command   ? web"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
          />
          <span className="ln-count">{navCount}</span>
        </div>

        {!searching && (
        <div className="ln-cats">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`ln-cat ${category === c ? "active" : ""}`}
              onClick={() => {
                setCategory(c);
                setSelected(0);
                inputRef.current?.focus();
              }}
            >
              {c}
            </button>
          ))}
        </div>
        )}

        {searching ? (
          <div className="ln-scroll ln-results" ref={resultsRef}>
            {results.length === 0 ? (
              <div className="ln-empty">No matches. Try "&gt; command" to run something or "? words" to search the web.</div>
            ) : (
              results.map((item, idx) => {
                const armed = search.armedKey === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-idx={idx}
                    className={`ln-result ${idx === selected ? "selected" : ""} ${armed ? "armed" : ""} kind-${item.kind}`}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => search.activate(item)}
                    onContextMenu={(e) => {
                      if (item.path && (item.kind === "app" || item.kind === "file" || item.kind === "folder")) {
                        openMenu(e, item.title, item.path);
                      } else e.preventDefault();
                    }}
                  >
                    <span className="ln-result-icon">
                      <ResultIcon item={item} size={18} />
                    </span>
                    <span className="ln-result-text">
                      <span className="ln-result-title">{item.title}</span>
                      <span className="ln-result-sub">{armed && item.confirm ? item.confirm : item.subtitle}</span>
                    </span>
                    <span className="ln-result-badge">{armed ? "Confirm ↵" : resultBadge(item)}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : (
        <div className="ln-scroll">
          {showHome && pinned.length > 0 && (
            <>
              <div className="ln-section">Pinned</div>
              <div className="ln-row">
                {pinned.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ln-chip"
                    onClick={() => launch(p.path)}
                    onContextMenu={(e) => openMenu(e, p.name, p.path)}
                  >
                    <LazyIcon path={p.path} size={22} />
                    <span className="ln-chip-label">{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {showHome && recent.length > 0 && (
            <>
              <div className="ln-section">Recent</div>
              <div className="ln-row">
                {recent.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="ln-chip"
                    onClick={() => launch(f.path)}
                    onContextMenu={(e) => openMenu(e, f.name, f.path)}
                  >
                    <span className="ln-icon" style={{ width: 22, height: 22 }}>
                      {f.isDir ? (
                        <Folder size={15} strokeWidth={2.2} />
                      ) : (
                        <FileText size={15} strokeWidth={2.2} />
                      )}
                    </span>
                    <span className="ln-chip-label">{f.name}</span>
                    <span className="ln-chip-meta">{f.ageLabel}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="ln-section">{category === ALL ? "All apps" : category}</div>
          {filtered.length === 0 ? (
            <div className="ln-empty">No apps in this group.</div>
          ) : (
            <div
              ref={gridRef}
              className="ln-grid"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
            >
              {filtered.map((app, idx) => (
                <button
                  key={app.path}
                  type="button"
                  data-idx={idx}
                  className={`ln-tile ${idx === selected ? "selected" : ""}`}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => launch(app.path)}
                  onContextMenu={(e) => openMenu(e, app.name, app.path)}
                >
                  <LazyIcon path={app.path} size={36} />
                  <span className="ln-tile-label">{app.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="ln-footer">
          <div className="ln-hint">
            {status ?? (
              <>
                <CornerDownLeft size={12} strokeWidth={2.4} /> {searching && results[selected]?.kind === "calc" ? "Copy" : "Open"}
                <span className="ln-hint-sep" />
                Ctrl+Shift+Enter as admin
                <span className="ln-hint-sep" />
                Right-click for more
              </>
            )}
          </div>
          <div className="ln-power">
            {POWER_ACTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ln-power-btn ${armed === p.id ? "armed" : ""}`}
                aria-label={p.label}
                onClick={(e) => {
                  e.stopPropagation();
                  runPower(p.id);
                }}
              >
                {p.icon}
                <span>{armed === p.id ? p.confirm : p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {menu && (
          <div
            className="ln-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="ln-menu-title">{menu.name}</div>
            <button type="button" className="ln-menu-item" onClick={() => launch(menu.path)}>
              <AppWindow size={13} strokeWidth={2.3} /> Open
            </button>
            <button type="button" className="ln-menu-item" onClick={() => launch(menu.path, "admin")}>
              <ShieldCheck size={13} strokeWidth={2.3} /> Run as administrator
            </button>
            <button type="button" className="ln-menu-item" onClick={() => launch(menu.path, "reveal")}>
              <Folder size={13} strokeWidth={2.3} /> Show in folder
            </button>
            <button
              type="button"
              className="ln-menu-item"
              onClick={() => togglePin(menu.name, menu.path)}
            >
              <Pin size={13} strokeWidth={2.3} /> {isPinned(menu.path) ? "Unpin from Dock" : "Pin to Dock"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
