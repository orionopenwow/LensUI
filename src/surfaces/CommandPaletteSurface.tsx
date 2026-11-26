import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlyoutClose } from "../ui/FlyoutClose";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Search,
  AppWindow,
  Layers,
  SlidersHorizontal,
  CornerDownLeft,
  FileText,
  FileCode2,
  Image as ImageIcon,
  Folder,
  Clock,
  Terminal,
  Globe,
  Sparkles,
  Activity,
} from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import type { InstalledApp } from "../types/lens";
import { useUnifiedSearch } from "../search/useUnifiedSearch";
import { filterByTab, type RankedItem, type SearchItem } from "../search/engine";
import { ResultIcon, resultBadge } from "../search/ResultIcon";
import { useAiPaletteItems } from "../ai/paletteAi";
import { AskPanel } from "../ai/AskPanel";
import { aiRunIntent } from "../ai/client";
import { parseNaturalLanguageActions } from "../utils/nlActionRouter";
import "./CommandPaletteSurface.css";

interface RecentFileItem {
  name: string;
  path: string;
  ext: string;
  ageLabel: string;
}

interface QuickFolderItem {
  name: string;
  path: string;
  color: string;
}

interface LauncherHomeData {
  recentFiles: RecentFileItem[];
  folders: QuickFolderItem[];
}

type FilterTab = "all" | "apps" | "files" | "folders" | "recent";

function MatteFolderSvg({ color }: { color: string }) {
  const map: Record<string, { back: string; top: string; bot: string }> = {
    cobalt: { back: "#0284c7", top: "#38bdf8", bot: "#0369a1" },
    amber: { back: "#b45309", top: "#fbbf24", bot: "#d97706" },
    emerald: { back: "#047857", top: "#34d399", bot: "#059669" },
    minimal: { back: "#a1a1aa", top: "#fafafa", bot: "#d4d4d8" },
  };
  const p = map[color] ?? map.cobalt;
  const gid = `pf-${color}`;
  return (
    <svg viewBox="0 0 64 56" width="38" height="33" style={{ display: "block", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.top} />
          <stop offset="100%" stopColor={p.bot} />
        </linearGradient>
      </defs>
      <path
        d="M4 12C4 8.7 6.7 6 10 6H23C24.9 6 26.7 6.9 27.8 8.4L30 11.2C30.8 12.1 31.9 12.6 33 12.6H54C57.3 12.6 60 15.3 60 18.6V46C60 49.3 57.3 52 54 52H10C6.7 52 4 49.3 4 46V12Z"
        fill={p.back}
      />
      <rect x="4" y="17" width="56" height="35" rx="7" fill={`url(#${gid})`} />
      <path d="M11 18H53" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function FileTypeIcon({ ext }: { ext?: string }) {
  const e = (ext || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(e)) {
    return <ImageIcon size={17} strokeWidth={2.2} color="#34D399" />;
  }
  if (["ts", "tsx", "js", "rs", "py", "json", "css", "html", "md"].includes(e)) {
    return <FileCode2 size={17} strokeWidth={2.2} color="#60A5FA" />;
  }
  if (e === "pdf") {
    return <FileText size={17} strokeWidth={2.2} color="#FB7185" />;
  }
  return <FileText size={17} strokeWidth={2.2} color="#A78BFA" />;
}

export const CommandPaletteSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  const glidePhase = useSurfaceGlide("palette");
  const runningWindows = useRunningWindows(1500);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [homeData, setHomeData] = useState<LauncherHomeData>({ recentFiles: [], folders: [] });
  const [pinnedIcons, setPinnedIcons] = useState<Record<string, string | null>>({});
  const [anchor, setAnchor] = useState<"bottom-dock" | "top-left">("bottom-dock");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<{ filtered: RankedItem[]; selected: number; activate: (i: SearchItem) => boolean }>({
    filtered: [],
    selected: 0,
    activate: () => false,
  });

  const refreshData = () => {
    invoke<InstalledApp[]>("scan_installed_apps_cmd")
      .then(setApps)
      .catch(() => {});
    invoke<LauncherHomeData>("get_launcher_home_cmd")
      .then(setHomeData)
      .catch(() => {});
  };

  useEffect(() => {
    refreshData();
    const focusNow = () => {
      setSelected(0);
      setQuery("");
      setFilterTab("all");
      refreshData();
      inputRef.current?.focus();
      window.setTimeout(() => inputRef.current?.focus(), 25);
    };

    focusNow();

    const onFocus = () => focusNow();
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) {
          invoke("hide_surface", { label: "palette" }).catch(() => {});
        }
      }, 150);
    };
    const unlistenQuery = listen<string>("lens://palette-query", (e) => {
      setQuery(e.payload);
      setSelected(0);
    });
    const unlistenAnchor = listen<string>("lens://palette-anchor", (e) => {
      setAnchor(e.payload === "bottom-dock" ? "bottom-dock" : "top-left");
      setSelected(0);
      refreshData();
    });
    const unlistenNav = listen<string>("lens://palette-nav", (e) => {
      const k = e.payload;
      if (k === "ArrowDown") {
        setSelected((s) => Math.min(Math.max(0, navRef.current.filtered.length - 1), s + 1));
      } else if (k === "ArrowUp") {
        setSelected((s) => Math.max(0, s - 1));
      } else if (k === "Enter") {
        const item = navRef.current.filtered[navRef.current.selected];
        if (item) navRef.current.activate(item);
      }
    });

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      unlistenQuery.then((fn) => fn());
      unlistenAnchor.then((fn) => fn());
      unlistenNav.then((fn) => fn());
    };
  }, []);

  // Load real full-color icons for pinned apps
  useEffect(() => {
    if (!config) return;
    config.dock.pinnedApps.forEach((app) => {
      if (pinnedIcons[app.id] !== undefined) return;
      invoke<string | null>("get_icon_for_path", { path: app.path })
        .then((icon) => setPinnedIcons((prev) => ({ ...prev, [app.id]: icon })))
        .catch(() => {});
    });
  }, [config]);

  // "Ask AI" keeps the palette open and shows the answer in place of the results.
  const [askPrompt, setAskPrompt] = useState<string | null>(null);
  const askingRef = useRef(false);
  const hide = () => {
    if (askingRef.current) {
      askingRef.current = false;
      return;
    }
    setAskPrompt(null);
    invoke("hide_surface", { label: "palette" }).catch(() => {});
  };

  // Same ranking as the Launcher and the Dock search (src/search).
  const search = useUnifiedSearch(query, {
    surface: "palette",
    onDone: hide,
    windows: runningWindows,
    config,
    updateConfig,
    limit: 40,
  });
  const aiOn = !!config?.ai?.enabled;
  const aiHandlers = useMemo(
    () => ({
      openAsk: (p: string) => {
        askingRef.current = true;
        setAskPrompt(p);
      },
      // "Do it": the offline intent runs through ai-core's tool registry with its risk gating.
      runIntent: (intent: Parameters<typeof aiRunIntent>[0]) => {
        aiRunIntent(intent).catch(() => {});
      },
    }),
    []
  );
  const ai = useAiPaletteItems(
    query,
    { enabled: aiOn, hasLocalPlan: aiOn && parseNaturalLanguageActions(query).length > 0 },
    aiHandlers
  );
  const filtered = useMemo(() => {
    const base = filterByTab(search.results, filterTab).slice(0, 30);
    if (!ai.items.length) return base;
    const aiItems: RankedItem[] = ai.items.map((i) => ({ ...i, score: 0 }));
    if (ai.exclusive) return aiItems;
    const top = aiItems.filter((i) => i.special !== "bottom");
    const bottom = aiItems.filter((i) => i.special === "bottom");
    return [...top, ...base, ...bottom];
  }, [search.results, filterTab, ai]);

  const showHomeGrid = query.trim() === "" && filterTab === "all";
  navRef.current = { filtered, selected, activate: search.activate };

  // Esc closes the palette wherever focus is: the search field lives in the Top Bar or Dock, so the
  // palette window often has focus on its body, where a handler on the root never sees the key.
  const escRef = useRef<() => void>(() => {});
  escRef.current = () => {
    if (askPrompt !== null) {
      setAskPrompt(null);
      return;
    }
    hide();
  };
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) escRef.current();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Handled by the window listener above (one close per key press).
      return;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(Math.max(0, filtered.length - 1), s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter" && filtered[selected]) {
      e.preventDefault();
      search.activate(filtered[selected]);
    }
  };

  // Top 4 "Recent & Running" items combining active windows + recent files
  const recentAndRunning = useMemo(() => {
    const list: { id: string; title: string; badge: string; iconUrl?: string | null; ext?: string; isWin?: boolean; run: () => void }[] = [];
    for (const w of runningWindows.slice(0, 2)) {
      list.push({
        id: `rr-w-${w.hwnd}`,
        title: w.processName.replace(/\.exe$/i, ""),
        badge: w.isFocused ? "Active" : "Open",
        iconUrl: w.iconDataUrl,
        isWin: true,
        run: () => {
          hide();
          invoke("focus_window_cmd", { hwnd: w.hwnd });
        },
      });
    }
    for (const rf of homeData.recentFiles.slice(0, Math.max(2, 4 - list.length))) {
      list.push({
        id: `rr-f-${rf.path}`,
        title: rf.name,
        badge: rf.ageLabel,
        ext: rf.ext,
        run: () => {
          hide();
          invoke("launch_app_cmd", { path: rf.path });
        },
      });
    }
    return list.slice(0, 4);
  }, [runningWindows, homeData.recentFiles]);

  // Bottom 6-icon Apps row (pinned apps + Control Center)
  const quickApps = useMemo(() => {
    const cards: { id: string; label: string; iconUrl?: string | null; hint?: string | null; isSettings?: boolean; run: () => void }[] = [];
    if (config) {
      for (const a of config.dock.pinnedApps.slice(0, 5)) {
        cards.push({
          id: a.id,
          label: a.name,
          iconUrl: pinnedIcons[a.id],
          hint: a.iconHint,
          run: () => {
            hide();
            invoke("launch_app_cmd", { path: a.path });
          },
        });
      }
    }
    cards.push({
      id: "lens-cc",
      label: "Control Center",
      isSettings: true,
      run: () => {
        hide();
        invoke("open_surface", { label: "settings" });
      },
    });
    return cards.slice(0, 6);
  }, [config, pinnedIcons]);

  return (
    <div
      data-guide-id="palette"
      className={`pal-root ${anchor === "bottom-dock" ? "is-bottom-dock" : "is-top-left"}`}
      onKeyDown={onKeyDown}
    >
      <div className={`pal-shell ${anchor === "bottom-dock" ? "lens-glide-dock" : "lens-glide-top"} ${glidePhase}`}>
        {/* Filter Pills Row (Search input lives directly inside the gliding Top Bar or Bottom Dock — zero double search bars!) */}
        <div className="pal-filter-bar">
          {(
            [
              { id: "all", label: "Overview", count: null, color: "#38BDF8", icon: Sparkles },
              { id: "files", label: "Files", count: homeData.recentFiles.length, color: "#60A5FA", icon: FileText },
              { id: "folders", label: "Folders", count: homeData.folders.length, color: "#FBBF24", icon: Folder },
              { id: "apps", label: "Apps", count: apps.length, color: "#A78BFA", icon: AppWindow },
              { id: "recent", label: "Running", count: runningWindows.length, color: "#34D399", icon: Activity },
            ] as const
          ).map((f) => {
            const isActive = filterTab === f.id;
            const IconComp = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                className={`pal-filter-pill ${isActive ? "active" : ""}`}
                onClick={() => {
                  setFilterTab(f.id);
                  setSelected(0);
                  inputRef.current?.focus();
                }}
              >
                <IconComp
                  size={13}
                  strokeWidth={2.4}
                  color={isActive ? "var(--lens-on-fg)" : f.color}
                  style={{ flexShrink: 0 }}
                />
                <span>{f.label}</span>
                {f.count !== null && (
                  <span className="pal-filter-count">{f.count}</span>
                )}
              </button>
            );
          })}
          <FlyoutClose pinned inline label="Close Search" onClose={() => invoke("hide_surface", { label: "palette" }).catch(() => {})} />
        </div>

        {/* Main Content: Mockup-Parity Launcher Home Grid OR Live Filtered Results */}
        {showHomeGrid ? (
          <div className="pal-home">
            {/* Intuitive 1-Click Quick Actions Strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {[
                { label: "Tile 50/50", color: "#38BDF8", run: () => { hide(); invoke("tile_windows_cmd", { layout: "split" }).catch(() => {}); } },
                { label: "Smart Group", color: "#FBBF24", run: () => { hide(); invoke("tile_windows_cmd", { layout: "smart-group" }).catch(() => {}); } },
                { label: "Next Desktop", color: "#A78BFA", run: () => { hide(); invoke("switch_virtual_desktop_cmd", { direction: "next" }).catch(() => {}); } },
                { label: "System & Tasks", color: "#34D399", run: () => { hide(); invoke("open_dock_popout_tab_cmd", { tab: "monitor" }).catch(() => {}); } },
                { label: "Messages", color: "#60A5FA", run: () => { hide(); invoke("open_dock_popout_tab_cmd", { tab: "messages" }).catch(() => {}); } },
              ].map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  className="pal-filter-pill"
                  style={{ flex: "0 0 auto", height: 28, padding: "0 10px", fontSize: 11.5 }}
                  onClick={qa.run}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: qa.color }} />
                  <span>{qa.label}</span>
                </button>
              ))}
            </div>

            <div className="pal-two-col">
              <div>
                <div className="pal-col-title">Recent &amp; Running</div>
                <div className="pal-recent-list">
                  {recentAndRunning.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--lens-fg-muted)", padding: "8px 4px" }}>
                      Start typing to search apps &amp; files...
                    </div>
                  ) : (
                    recentAndRunning.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`pal-recent-row ${idx === 0 ? "first" : ""}`}
                        onClick={item.run}
                      >
                        <span className="pal-recent-icon">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt="" />
                          ) : item.isWin ? (
                            <AppWindow size={17} color="#38BDF8" />
                          ) : (
                            <FileTypeIcon ext={item.ext} />
                          )}
                        </span>
                        <span className="pal-recent-name">{item.title}</span>
                        <span className="pal-recent-age">{item.badge}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="pal-col-title">Folders &amp; Files</div>
                <div className="pal-folder-grid">
                  {homeData.folders.map((folder) => (
                    <button
                      key={folder.path}
                      type="button"
                      className="pal-folder-card"
                      onClick={() => {
                        hide();
                        invoke("launch_app_cmd", { path: folder.path });
                      }}
                    >
                      <MatteFolderSvg color={folder.color} />
                      <span className="pal-folder-label">{folder.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="pal-col-title">Apps</div>
              <div className="pal-apps-row">
                {quickApps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    className="pal-app-card"
                    onClick={app.run}
                  >
                    <span className="pal-app-icon">
                      {app.isSettings ? (
                        <SlidersHorizontal size={22} strokeWidth={2.2} color="var(--lens-fg)" />
                      ) : app.iconUrl ? (
                        <img src={app.iconUrl} alt={app.label} />
                      ) : app.hint === "terminal" ? (
                        <Terminal size={22} color="#38BDF8" />
                      ) : app.hint === "globe" ? (
                        <Globe size={22} color="#60A5FA" />
                      ) : app.hint === "folder" ? (
                        <MatteFolderSvg color="amber" />
                      ) : (
                        <AppWindow size={22} color="#A78BFA" />
                      )}
                    </span>
                    <span className="pal-app-label">{app.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : askPrompt !== null ? (
          <div className="pal-results">
            <AskPanel key={askPrompt} initialPrompt={askPrompt} autoSend onClose={() => setAskPrompt(null)} />
          </div>
        ) : (
          <div className="pal-results">
            {filtered.map((item, idx) => {
              const armed = search.armedKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`pal-result-row ${idx === selected ? "selected" : ""} ${armed ? "armed" : ""} kind-${item.kind}`}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => search.activate(item)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <span className="pal-recent-icon">
                      <ResultIcon item={item} size={17} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                      <div className="pal-result-title">{item.title}</div>
                      <div className="pal-result-sub">{armed && item.confirm ? item.confirm : item.subtitle}</div>
                    </div>
                  </div>
                  <span className="pal-result-badge">{armed ? "Confirm ↵" : resultBadge(item)}</span>
                  {idx === selected ? (
                    <CornerDownLeft size={14} color="var(--lens-fg)" />
                  ) : (
                    <Clock size={12} color="transparent" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--lens-fg-muted)", fontSize: 12.5 }}>
                No matches. Try "&gt; command" to run something or "? words" to search the web.
              </div>
            )}
          </div>
        )}

        {/* Top-left mode keeps the search bar at top; Bottom-dock mode uses the live expanding-glide search bar inside the Dock itself! */}
      </div>
    </div>
  );
};
