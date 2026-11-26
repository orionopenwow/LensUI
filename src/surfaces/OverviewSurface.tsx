import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { hideSurface } from "../failsafe/calls";
import { listen } from "@tauri-apps/api/event";
import { Search, AppWindow, X, CornerDownLeft, ArrowBigUp } from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import type { RunningWindow } from "../types/lens";
import type * as Gen from "../types/generated";
import { moveTargetFor, workspaceCounts } from "../utils/overviewWorkspaces";
import { ackKeyhook, type KeyhookMessage } from "../shell/keyhookResponder";
import "./OverviewSurface.css";

/**
 * Lens Overview — every open window at a glance, grouped by app.
 * Arrows / Tab move, Enter switches, Delete or middle-click closes, type to filter, Esc dismisses.
 * With Lens workspaces in groups mode a strip of workspaces sits on top: drag a window onto one
 * (or press Shift+Left/Right, Shift+1–9) to move it there; click one to show only its windows.
 *
 *
 * With "Alt+Tab opens Lens Overview" on, the keyboard hook (win_keyhook.rs) drives it like Windows'
 * own switcher: Alt+Tab opens it on the previously used window, each further Tab (Shift = back)
 * moves along the most-recently-used order, releasing Alt switches, Esc cancels. Every hook event
 * is acknowledged so the hook knows Lens is responsive.
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
  const [closeRequested, setCloseRequested] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const armed = useRef(true);
  const [openTick, setOpenTick] = useState(0);
  const [wsStatus, setWsStatus] = useState<Gen.WorkspaceStatus | null>(null);
  const [membership, setMembership] = useState<Map<number, number>>(new Map());
  const [wsFilter, setWsFilter] = useState<number | null>(null);
  const [dragHwnd, setDragHwnd] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  const [wsNote, setWsNote] = useState("");

  const loadWorkspaces = useCallback(() => {
    invoke<Gen.WorkspaceStatus>("get_workspaces_status_cmd")
      .then((st) => setWsStatus(st ?? null))
      .catch(() => {});
    invoke<[number, number][]>("get_window_workspaces_cmd")
      .then((pairs) => setMembership(new Map(pairs ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadWorkspaces();
    const un = listen<Gen.WorkspaceStatus>("lens://workspaces-changed", (e) => {
      setWsStatus(e.payload);
      invoke<[number, number][]>("get_window_workspaces_cmd")
        .then((pairs) => setMembership(new Map(pairs ?? [])))
        .catch(() => {});
    });
    return () => {
      un.then((f) => f());
    };
  }, [loadWorkspaces]);

  // Moving windows between workspaces is something Lens can do itself only in groups mode.
  const wsActive = !!wsStatus?.enabled && wsStatus.mode === "groups" && (wsStatus.workspaces?.length ?? 0) > 1;
  const wsOf = useCallback(
    (hwnd: number) => membership.get(hwnd) ?? wsStatus?.active ?? 0,
    [membership, wsStatus]
  );

  /** True while Alt is held after Alt+Tab (hook-driven cycling). */
  const keyCycle = useRef(false);
  const [keyCycleActive, setKeyCycleActive] = useState(false);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selectedHwnd;

  const hide = useCallback(() => {
    void hideSurface("overview");
  }, []);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const w of running) {
      const proc = w.processName.toLowerCase();
      if (proc === "lens-ui.exe" || proc === "lens-ui") continue;
      if (closeRequested.has(w.hwnd)) continue;
      if (wsActive && wsFilter !== null && wsOf(w.hwnd) !== wsFilter) continue;
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
  }, [running, query, closeRequested, wsActive, wsFilter, wsOf]);

  const flat = useMemo(() => groups.flatMap((g) => g.windows), [groups]);

  const appHwnds = useMemo(
    () => running.filter((w) => !/^lens-ui(\.exe)?$/i.test(w.processName)).map((w) => w.hwnd),
    [running]
  );
  const wsCounts = useMemo(
    () => (wsStatus ? workspaceCounts(appHwnds, wsOf, wsStatus.workspaces.length) : []),
    [appHwnds, wsOf, wsStatus]
  );

  /** Alt+Tab order: the window list as Windows reports it (front-most first), unfiltered. */
  const cycleOrder = useMemo(() => {
    return running.filter((w) => {
      const proc = w.processName.toLowerCase();
      return proc !== "lens-ui.exe" && proc !== "lens-ui" && !closeRequested.has(w.hwnd);
    });
  }, [running, closeRequested]);
  const cycleOrderRef = useRef<RunningWindow[]>(cycleOrder);
  cycleOrderRef.current = cycleOrder;

  // On open: clear the filter and preselect the window you'd most likely switch to (the first that isn't focused).
  useEffect(() => {
    const reset = () => {
      setQuery("");
      setCloseRequested(new Set());
      setWsFilter(null);
      setWsNote("");
      setDragHwnd(null);
      setDropOver(null);
      loadWorkspaces();
      // While Alt+Tab is cycling, the hook already chose the selection.
      armed.current = !keyCycle.current;
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
  }, [hide, loadWorkspaces]);

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

  // Alt+Tab via the keyboard hook (only fires when that option is on).
  useEffect(() => {
    const pick = (fromIdx: number, delta: number) => {
      const order = cycleOrderRef.current;
      if (order.length === 0) return;
      const next = (((fromIdx + delta) % order.length) + order.length) % order.length;
      setSelectedHwnd(order[next].hwnd);
    };
    const un = listen<KeyhookMessage>("lens://keyhook", (e) => {
      const { seq, event } = e.payload ?? ({} as KeyhookMessage);
      if (!event) return;
      switch (event.kind) {
        case "overviewOpen": {
          ackKeyhook(seq);
          keyCycle.current = true;
          setKeyCycleActive(true);
          armed.current = false;
          setQuery("");
          const order = cycleOrderRef.current;
          // Forward starts on the previously used window (index 1), backwards on the oldest.
          if (order.length > 0) setSelectedHwnd(order[event.backwards ? order.length - 1 : Math.min(1, order.length - 1)].hwnd);
          break;
        }
        case "overviewStep": {
          ackKeyhook(seq);
          const order = cycleOrderRef.current;
          const cur = order.findIndex((w) => w.hwnd === selectedRef.current);
          pick(cur < 0 ? 0 : cur, event.delta);
          break;
        }
        case "overviewCommit": {
          if (keyCycle.current && selectedRef.current !== null) switchTo(selectedRef.current);
          keyCycle.current = false;
          setKeyCycleActive(false);
          break;
        }
        case "overviewCancel": {
          if (keyCycle.current) hide();
          keyCycle.current = false;
          setKeyCycleActive(false);
          break;
        }
        default:
          break;
      }
    });
    return () => {
      un.then((fn) => fn());
    };
  }, [hide, switchTo]);

  const closeWindow = useCallback((hwnd: number) => {
    setCloseRequested((prev) => new Set(prev).add(hwnd));
    invoke("window_action_cmd", { hwnd, action: "close" }).catch(() => {});
    // If the app refuses to close (unsaved changes), show it again.
    window.setTimeout(() => {
      setCloseRequested((prev) => {
        const next = new Set(prev);
        next.delete(hwnd);
        return next;
      });
    }, 2500);
  }, []);

  const moveToWorkspace = useCallback(
    (hwnd: number, index: number) => {
      if (!wsStatus || index < 0 || index >= wsStatus.workspaces.length) return;
      if (wsOf(hwnd) === index) return;
      // Optimistic: the tile moves at once; the backend's answer (or error) settles it.
      setMembership((prev) => new Map(prev).set(hwnd, index));
      setWsNote(`Moved to ${wsStatus.workspaces[index].name}`);
      invoke<Gen.WorkspaceStatus>("move_window_to_workspace_cmd", { hwnd, target: String(index + 1) })
        .then((st) => {
          if (st) setWsStatus(st);
        })
        .catch((e) => {
          setWsNote(String(e));
          loadWorkspaces();
        });
    },
    [wsStatus, wsOf, loadWorkspaces]
  );

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
    if (wsActive && e.shiftKey && selectedHwnd !== null && wsStatus) {
      const to = moveTargetFor(e.key, e.code, wsOf(selectedHwnd), wsStatus.workspaces.length);
      if (to !== null) {
        e.preventDefault();
        moveToWorkspace(selectedHwnd, to);
        return;
      }
    }
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
    <div
      className="ov-root"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // A click on the empty space around the panel dismisses it.
        if (e.target === e.currentTarget) hide();
      }}
    >
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

        {wsActive && wsStatus && (
          <div className="ov-ws-strip" role="toolbar" aria-label="Workspaces">
            <button
              type="button"
              className={`ov-ws ${wsFilter === null ? "active" : ""}`}
              aria-pressed={wsFilter === null}
              onClick={() => setWsFilter(null)}
            >
              <span className="ov-ws-name">All</span>
              <span className="ov-ws-count">{appHwnds.length}</span>
            </button>
            {wsStatus.workspaces.map((ws, i) => {
              return (
                <button
                  key={ws.id}
                  type="button"
                  className={`ov-ws ${wsFilter === i ? "active" : ""} ${dropOver === i ? "drop" : ""} ${
                    wsStatus.active === i ? "current" : ""
                  }`}
                  aria-pressed={wsFilter === i}
                  aria-label={`${ws.name}: ${wsCounts[i] ?? 0} windows${wsStatus.active === i ? ", current workspace" : ""}. Drop a window here to move it.`}
                  onClick={() => setWsFilter(wsFilter === i ? null : i)}
                  onDragOver={(e) => {
                    if (dragHwnd === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropOver !== i) setDropOver(i);
                  }}
                  onDragLeave={() => setDropOver((d) => (d === i ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const h = dragHwnd ?? Number(e.dataTransfer.getData("text/lens-hwnd"));
                    setDropOver(null);
                    setDragHwnd(null);
                    if (h) moveToWorkspace(h, i);
                  }}
                >
                  <span className="ov-ws-dot" style={{ background: ws.color }} />
                  <span className="ov-ws-name">{ws.name}</span>
                  <span className="ov-ws-count">{wsCounts[i] ?? 0}</span>
                  <span className="ov-ws-key" aria-hidden="true">
                    <ArrowBigUp size={9} strokeWidth={2.6} />
                    {i + 1}
                  </span>
                </button>
              );
            })}
            <span className="ov-ws-note" aria-live="polite">
              {dragHwnd !== null ? "Drop on a workspace to move it" : wsNote || "Drag a window onto a workspace"}
            </span>
          </div>
        )}

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
                      role="group"
                      aria-label={w.title || g.label}
                      data-hwnd={w.hwnd}
                      className={`ov-tile ${w.hwnd === selectedHwnd ? "selected" : ""} ${
                        w.isMinimized ? "minimized" : ""
                      } ${dragHwnd === w.hwnd ? "dragging" : ""}`}
                      draggable={wsActive}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/lens-hwnd", String(w.hwnd));
                        e.dataTransfer.effectAllowed = "move";
                        setDragHwnd(w.hwnd);
                        setSelectedHwnd(w.hwnd);
                      }}
                      onDragEnd={() => {
                        setDragHwnd(null);
                        setDropOver(null);
                      }}
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
                        {wsActive && wsStatus && (
                          <span
                            className="ov-ws-badge"
                            style={{ background: wsStatus.workspaces[wsOf(w.hwnd)]?.color }}
                            aria-hidden="true"
                          />
                        )}
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
          {keyCycleActive ? (
            <span className="ov-key">Release Alt to switch · Tab next · Shift+Tab back</span>
          ) : (
            <span className="ov-key">
              <CornerDownLeft size={11} strokeWidth={2.4} /> Switch
            </span>
          )}
          <span className="ov-key">Tab / Arrows Move</span>
          <span className="ov-key">Del Close</span>
          {wsActive && <span className="ov-key">Shift+← → Move to workspace</span>}
          <span className="ov-key">Esc Dismiss</span>
        </div>
      </div>
    </div>
  );
};
