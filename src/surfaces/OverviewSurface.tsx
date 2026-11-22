import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, AppWindow, X, CornerDownLeft } from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import type { RunningWindow } from "../types/lens";
import "./OverviewSurface.css";

/**
 * Lens Overview — every open window at a glance, grouped by app.
 * Arrows / Tab move, Enter switches, Delete or middle-click closes, type to filter, Esc dismisses.
 */

function appLabel(w: RunningWindow): string {
  const base = w.processName.replace(/\.exe$/i, "");
  return base.length > 0 ? base.charAt(0).toUpperCase() + base.slice(1) : "App";
}

interface Group {
  key: string;
  label: string;
  icon: string | null;
  windows: RunningWindow[];
}

export const OverviewSurface: React.FC = () => {
  // Applies the active theme pack (light/dark tokens) to this window.
  useLensState();
  const glidePhase = useSurfaceGlide("overview");
  const running = useRunningWindows(1000);
  const [query, setQuery] = useState("");
  const [selectedHwnd, setSelectedHwnd] = useState<number | null>(null);
  const [closing, setClosing] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const armed = useRef(true);
  const [openTick, setOpenTick] = useState(0);

  const hide = useCallback(() => {
    invoke("hide_surface", { label: "overview" }).catch(() => {});
  }, []);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const w of running) {
      const proc = w.processName.toLowerCase();
      if (proc === "lens-ui.exe" || proc === "lens-ui") continue;
      if (closing.has(w.hwnd)) continue;
      if (q && !w.title.toLowerCase().includes(q) && !proc.includes(q)) continue;
      let g = map.get(proc);
      if (!g) {
        g = { key: proc, label: appLabel(w), icon: w.iconDataUrl ?? null, windows: [] };
        map.set(proc, g);
      }
      if (!g.icon && w.iconDataUrl) g.icon = w.iconDataUrl;
      g.windows.push(w);
    }
    return [...map.values()];
  }, [running, query, closing]);

  const flat = useMemo(() => groups.flatMap((g) => g.windows), [groups]);

  // On open: clear the filter and preselect the window you'd most likely switch to (the first that isn't focused).
  useEffect(() => {
    const reset = () => {
      setQuery("");
      setClosing(new Set());
      armed.current = true;
      setOpenTick((t) => t + 1);
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
    };
  }, [hide]);

  useEffect(() => {
    if (flat.length === 0) {
      setSelectedHwnd(null);
      return;
    }
    if (armed.current) {
      armed.current = false;
      const target = flat.find((w) => !w.isFocused) ?? flat[0];
      setSelectedHwnd(target.hwnd);
      return;
    }
    if (selectedHwnd === null || !flat.some((w) => w.hwnd === selectedHwnd)) {
      setSelectedHwnd(flat[0].hwnd);
    }
  }, [flat, selectedHwnd, openTick]);

  useEffect(() => {
    if (selectedHwnd === null) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(`[data-hwnd="${selectedHwnd}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedHwnd]);

  const switchTo = useCallback(
    (hwnd: number) => {
      hide();
      invoke("focus_window_cmd", { hwnd }).catch(() => {});
    },
    [hide]
  );

  const closeWindow = useCallback((hwnd: number) => {
    setClosing((prev) => new Set(prev).add(hwnd));
    invoke("window_action_cmd", { hwnd, action: "close" }).catch(() => {});
    // If the app refuses to close (unsaved changes), show it again.
    window.setTimeout(() => {
      setClosing((prev) => {
        const next = new Set(prev);
        next.delete(hwnd);
        return next;
      });
    }, 2500);
  }, []);

  /** Moves the selection to the nearest tile in the given direction, using real on-screen positions. */
  const moveSpatial = (dx: number, dy: number) => {
    const body = bodyRef.current;
    if (!body || selectedHwnd === null) return;
    const tiles = [...body.querySelectorAll<HTMLElement>("[data-hwnd]")];
    const cur = tiles.find((t) => t.dataset.hwnd === String(selectedHwnd));
    if (!cur) return;
    const c = cur.getBoundingClientRect();
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const t of tiles) {
      if (t === cur) continue;
      const r = t.getBoundingClientRect();
      const ox = r.left + r.width / 2 - cx;
      const oy = r.top + r.height / 2 - cy;
      const along = dx !== 0 ? ox * dx : oy * dy;
      const across = dx !== 0 ? Math.abs(oy) : Math.abs(ox);
      if (along <= 4) continue;
      const score = along + across * 3;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best?.dataset.hwnd) setSelectedHwnd(Number(best.dataset.hwnd));
  };

  const step = (delta: number) => {
    if (flat.length === 0) return;
    const idx = Math.max(0, flat.findIndex((w) => w.hwnd === selectedHwnd));
    setSelectedHwnd(flat[(idx + delta + flat.length) % flat.length].hwnd);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) setQuery("");
      else hide();
    } else if (e.key === "Tab") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveSpatial(1, 0);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveSpatial(-1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSpatial(0, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSpatial(0, -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedHwnd !== null) switchTo(selectedHwnd);
    } else if (e.key === "Delete") {
      e.preventDefault();
      if (selectedHwnd !== null) closeWindow(selectedHwnd);
    }
  };

  return (
    <div className="ov-root" onKeyDown={onKeyDown}>
      <div className={`ov-shell lens-glass lens-glide-dock ${glidePhase}`}>
        <div className="ov-head">
          <div className="ov-search">
            <Search size={15} strokeWidth={2.55} />
            <input
              ref={inputRef}
              className="ov-search-input"
              value={query}
              aria-label="Filter open windows"
              placeholder="Filter open windows"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="ov-count">
            {flat.length} {flat.length === 1 ? "window" : "windows"}
          </span>
        </div>

        <div ref={bodyRef} className="ov-body">
          {groups.length === 0 ? (
            <div className="ov-empty">
              {query.trim() ? `No open windows match "${query.trim()}".` : "No open windows."}
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="ov-group">
                <header className="ov-group-head">
                  <span className="ov-group-icon">
                    {g.icon ? (
                      <img src={g.icon} alt="" width={16} height={16} draggable={false} />
                    ) : (
                      <AppWindow size={13} strokeWidth={2.2} />
                    )}
                  </span>
                  <span className="ov-group-name">{g.label}</span>
                  <span className="ov-group-count">{g.windows.length}</span>
                </header>
                <div className="ov-grid">
                  {g.windows.map((w) => (
                    <div
                      key={w.hwnd}
                      role="button"
                      tabIndex={-1}
                      data-hwnd={w.hwnd}
                      className={`ov-tile ${w.hwnd === selectedHwnd ? "selected" : ""} ${
                        w.isMinimized ? "minimized" : ""
                      }`}
                      onMouseEnter={() => setSelectedHwnd(w.hwnd)}
                      onClick={() => switchTo(w.hwnd)}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          closeWindow(w.hwnd);
                        }
                      }}
                    >
                      <div className="ov-tile-art">
                        {w.iconDataUrl ? (
                          <img src={w.iconDataUrl} alt="" width={40} height={40} draggable={false} />
                        ) : (
                          <AppWindow size={26} strokeWidth={2} />
                        )}
                        {w.isFocused && <span className="ov-badge">Current</span>}
                        {w.isMinimized && <span className="ov-badge muted">Minimized</span>}
                      </div>
                      <div className="ov-tile-title">{w.title || g.label}</div>
                      <button
                        type="button"
                        className="ov-close"
                        aria-label={`Close ${w.title || g.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeWindow(w.hwnd);
                        }}
                      >
                        <X size={11} strokeWidth={2.8} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="ov-foot">
          <span className="ov-key">
            <CornerDownLeft size={11} strokeWidth={2.4} /> Switch
          </span>
          <span className="ov-key">Tab / Arrows Move</span>
          <span className="ov-key">Del Close</span>
          <span className="ov-key">Esc Dismiss</span>
        </div>
      </div>
    </div>
  );
};
