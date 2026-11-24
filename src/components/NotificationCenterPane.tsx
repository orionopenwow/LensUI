import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Bell, BellOff, Calendar, ChevronDown, Moon, Monitor, Plus, Sparkles, Timer, TriangleAlert, X } from "lucide-react";
import type { LensConfig } from "../types/lens";
import {
  DAY_LETTERS,
  DAY_NAMES,
  DEFAULT_DND_SCHEDULE,
  describeDndStatus,
  describeRange,
  minToTime,
  readDndSchedule,
  timeToMin,
  type DndRange,
  type DndSchedule,
  type DndStatus,
} from "../utils/productivity";
import { useLensState } from "../hooks/useLensState";
import { AskPanel } from "../ai/AskPanel";
import { notificationDigest } from "../ai/actions";
import type { AiContext } from "../ai/surfaceApi";
import "./NotificationCenterPane.css";

/** Mirrors `NotificationItem` in src-tauri/src/win_notifications.rs. */
export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  appName: string;
  category: string;
  tsMs: number;
  source: "lens" | "windows" | string;
}

interface WindowsToastResult {
  /** "ok" | "needs-access" | "denied" | "unavailable" */
  status: string;
  reason: string;
  items: NotificationItem[];
}

interface NotificationCenterState {
  dnd: boolean;
  dndStatus?: DndStatus;
  items: NotificationItem[];
  windows: WindowsToastResult;
}

interface Group {
  key: string;
  appName: string;
  source: string;
  category: string;
  latest: number;
  items: NotificationItem[];
}

/** A group shows this many notifications until it is expanded. */
export const GROUP_PREVIEW = 3;

const DND_STORAGE_KEY = "lens_dnd"; // also read by NotificationOverlaySurface and CalendarClockPane
const REFRESH_MS = 4000;

function readStoredDnd(): boolean | null {
  try {
    const v = localStorage.getItem(DND_STORAGE_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

function writeStoredDnd(enabled: boolean) {
  try {
    localStorage.setItem(DND_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — the backend flag still applies */
  }
}

function GroupIcon({ category, source }: { category: string; source: string }) {
  if (source === "windows") return <Monitor size={13} strokeWidth={2.4} color="#60A5FA" />;
  switch (category) {
    case "calendar":
      return <Calendar size={13} strokeWidth={2.4} color="#FBBF24" />;
    case "timer":
      return <Timer size={13} strokeWidth={2.4} color="#34D399" />;
    case "theme":
      return <Sparkles size={13} strokeWidth={2.4} color="#A78BFA" />;
    default:
      return <Bell size={13} strokeWidth={2.4} color="#38BDF8" />;
  }
}

export function formatWhen(tsMs: number, nowMs: number): string {
  if (!tsMs) return "";
  const diff = Math.max(0, nowMs - tsMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} hr ago`;
  const d = new Date(tsMs);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function groupNotifications(items: NotificationItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const item of items) {
    const key = `${item.source}:${item.appName}`;
    let g = map.get(key);
    if (!g) {
      g = { key, appName: item.appName, source: item.source, category: item.category, latest: 0, items: [] };
      map.set(key, g);
    }
    g.items.push(item);
    if (item.tsMs > g.latest) g.latest = item.tsMs;
  }
  const groups = Array.from(map.values());
  for (const g of groups) g.items.sort((a, b) => b.tsMs - a.tsMs);
  groups.sort((a, b) => b.latest - a.latest);
  return groups;
}

/**
 * Notification Center: Lens' own notification history plus Windows toasts from other apps,
 * grouped by app, with per-item dismiss, Clear all and Do Not Disturb.
 * Mount inside Quick Settings' body (it renders a `.qs-pane`).
 */
export const NotificationCenterPane: React.FC = () => {
  const [state, setState] = useState<NotificationCenterState | null>(null);
  const [dnd, setDnd] = useState<boolean>(() => readStoredDnd() ?? false);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const aliveRef = useRef(true);
  const syncedDndRef = useRef(false);
  const [schedule, setSchedule] = useState<DndSchedule>(DEFAULT_DND_SCHEDULE);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (document.hidden) return;
    invoke<NotificationCenterState>("get_notification_center_cmd")
      .then((s) => {
        if (!aliveRef.current) return;
        setState(s);
        setNowMs(Date.now());
        // First load: the flag other surfaces already use (localStorage) wins; otherwise adopt the saved one.
        if (!syncedDndRef.current) {
          syncedDndRef.current = true;
          const stored = readStoredDnd();
          if (stored === null) {
            setDnd(s.dnd);
            writeStoredDnd(s.dnd);
          } else if (stored !== s.dnd) {
            invoke("set_dnd_cmd", { enabled: stored }).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);

  // Quiet hours live in the config (LensConfig.dndSchedule) so they travel with backups.
  useEffect(() => {
    invoke<LensConfig>("get_config")
      .then((c) => setSchedule(readDndSchedule(c)))
      .catch(() => {});
    const un = listen<LensConfig>("lens://config-updated", (e) => setSchedule(readDndSchedule(e.payload)));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const saveSchedule = (next: DndSchedule) => {
    setSchedule(next);
    invoke<DndStatus>("set_dnd_schedule_cmd", { schedule: next })
      .then((st) => setState((prev) => (prev ? { ...prev, dndStatus: st } : prev)))
      .catch(() => {});
  };
  const updateRange = (i: number, patch: Partial<DndRange>) =>
    saveSchedule({ ...schedule, ranges: schedule.ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const unlistenChanged = listen("lens://notifications-changed", () => refresh());
    const unlistenPush = listen("lens://notification", () => refresh());
    // Do Not Disturb toggled from another surface (e.g. the Calendar pane)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DND_STORAGE_KEY) return;
      const enabled = e.newValue === "1";
      setDnd(enabled);
      invoke("set_dnd_cmd", { enabled }).catch(() => {});
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", refresh);
      unlistenChanged.then((fn) => fn());
      unlistenPush.then((fn) => fn());
    };
  }, [refresh]);

  const windowsInfo = state?.windows;
  const windowsOk = windowsInfo?.status === "ok";

  const groups = useMemo(
    () => groupNotifications([...(state?.items ?? []), ...(windowsOk ? windowsInfo?.items ?? [] : [])]),
    [state, windowsOk, windowsInfo]
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  // "Summarise" (only while Lens Intelligence is on; docs/AI_SURFACES.md §5).
  const { config: lensConfig } = useLensState();
  const aiOn = !!lensConfig?.ai?.enabled;
  const [digest, setDigest] = useState<{ prompt: string; context: AiContext } | null>(null);

  const toggleDnd = () => {
    const next = !dnd;
    setDnd(next);
    writeStoredDnd(next);
    invoke("set_dnd_cmd", { enabled: next }).catch(() => {});
  };

  const dismiss = (item: NotificationItem) => {
    // Optimistic: drop it from view immediately, then confirm with the backend.
    setState((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((x) => x.id !== item.id),
            windows: { ...prev.windows, items: prev.windows.items.filter((x) => x.id !== item.id) },
          }
        : prev
    );
    invoke("dismiss_notification_cmd", { id: item.id })
      .catch(() => {})
      .finally(refresh);
  };

  const dismissGroup = (group: Group) => {
    const ids = new Set(group.items.map((x) => x.id));
    setState((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((x) => !ids.has(x.id)),
            windows: { ...prev.windows, items: prev.windows.items.filter((x) => !ids.has(x.id)) },
          }
        : prev
    );
    Promise.all(
      group.items.map((x) => invoke("dismiss_notification_cmd", { id: x.id }).catch(() => {}))
    ).finally(refresh);
  };

  const clearAll = () => {
    setState((prev) => (prev ? { ...prev, items: [], windows: { ...prev.windows, items: [] } } : prev));
    invoke("clear_notifications_cmd", { includeWindows: windowsOk })
      .catch(() => {})
      .finally(refresh);
  };

  const requestAccess = () => {
    setBusy(true);
    invoke<WindowsToastResult>("request_windows_notification_access_cmd")
      .then((result) => {
        if (!aliveRef.current) return;
        setState((prev) => (prev ? { ...prev, windows: result } : prev));
      })
      .catch(() => {})
      .finally(() => {
        if (aliveRef.current) setBusy(false);
        refresh();
      });
  };

  const status = state?.dndStatus;
  const autoQuiet = !dnd && !!status?.active;

  return (
    <div key="pane-notifications" className="qs-pane">
      <div className="qs-card">
        <div className="qs-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dnd || autoQuiet ? (
              <BellOff size={15} strokeWidth={2.4} color="#FBBF24" />
            ) : (
              <Bell size={15} strokeWidth={2.4} />
            )}
            <div>
              <div className="qs-row-title">Do Not Disturb</div>
              <div className="qs-row-sub" aria-live="polite">
                {describeDndStatus(status, dnd)}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Toggle Do Not Disturb"
            aria-pressed={dnd}
            className={`qs-switch amber ${dnd ? "on" : ""}`}
            onClick={toggleDnd}
          >
            <span className="qs-switch-knob" />
          </button>
        </div>

        <button
          type="button"
          className="nc-schedule-toggle"
          aria-expanded={scheduleOpen}
          onClick={() => setScheduleOpen((o) => !o)}
        >
          <Moon size={13} strokeWidth={2.4} />
          <span>
            Quiet hours
            <span className="nc-schedule-sum">
              {schedule.enabled
                ? ` · ${schedule.ranges.length === 1 ? describeRange(schedule.ranges[0]) : `${schedule.ranges.length} times`}`
                : " · Off"}
              {schedule.autoFullscreen ? " · Fullscreen" : ""}
            </span>
          </span>
          <ChevronDown size={13} strokeWidth={2.4} className={`nc-chev ${scheduleOpen ? "open" : ""}`} />
        </button>

        {scheduleOpen && (
          <div className="nc-schedule">
            <div className="qs-row">
              <div>
                <div className="qs-row-title">On a schedule</div>
                <div className="qs-row-sub">Pause pop-ups at the same times every week.</div>
              </div>
              <button
                type="button"
                aria-label="Quiet hours on a schedule"
                aria-pressed={schedule.enabled}
                className={`qs-switch amber ${schedule.enabled ? "on" : ""}`}
                onClick={() => saveSchedule({ ...schedule, enabled: !schedule.enabled })}
              >
                <span className="qs-switch-knob" />
              </button>
            </div>

            <div className={`nc-ranges ${schedule.enabled ? "" : "nc-dim"}`} aria-disabled={!schedule.enabled}>
              {schedule.ranges.map((r, i) => (
                <div key={i} className="nc-range">
                  <div className="nc-range-times">
                    <input
                      type="time"
                      className="nc-time"
                      aria-label="Quiet from"
                      value={minToTime(r.startMin)}
                      onChange={(e) => {
                        const m = timeToMin(e.target.value);
                        if (m !== null) updateRange(i, { startMin: m });
                      }}
                    />
                    <span className="nc-range-to">to</span>
                    <input
                      type="time"
                      className="nc-time"
                      aria-label="Quiet until"
                      value={minToTime(r.endMin)}
                      onChange={(e) => {
                        const m = timeToMin(e.target.value);
                        if (m !== null) updateRange(i, { endMin: m });
                      }}
                    />
                    {r.endMin < r.startMin && <span className="nc-range-to">next day</span>}
                    {schedule.ranges.length > 1 && (
                      <button
                        type="button"
                        className="nc-range-x"
                        aria-label="Remove these quiet hours"
                        onClick={() => saveSchedule({ ...schedule, ranges: schedule.ranges.filter((_, j) => j !== i) })}
                      >
                        <X size={11} strokeWidth={2.6} />
                      </button>
                    )}
                  </div>
                  <div className="nc-days" role="group" aria-label="Days">
                    {DAY_LETTERS.map((d, day) => {
                      const on = r.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          aria-label={DAY_NAMES[day]}
                          className={`nc-day ${on ? "on" : ""}`}
                          onClick={() =>
                            updateRange(i, { days: on ? r.days.filter((x) => x !== day) : [...r.days, day].sort() })
                          }
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {schedule.ranges.length < 8 && (
                <button
                  type="button"
                  className="nc-ghost-btn nc-add-range"
                  onClick={() =>
                    saveSchedule({
                      ...schedule,
                      ranges: [...schedule.ranges, { startMin: 9 * 60, endMin: 12 * 60, days: [1, 2, 3, 4, 5] }],
                    })
                  }
                >
                  <Plus size={11} strokeWidth={2.6} /> Add times
                </button>
              )}
            </div>

            <div className="qs-row">
              <div>
                <div className="qs-row-title">During fullscreen apps</div>
                <div className="qs-row-sub">Games, videos and presentations stay uninterrupted.</div>
              </div>
              <button
                type="button"
                aria-label="Quiet during fullscreen apps"
                aria-pressed={schedule.autoFullscreen}
                className={`qs-switch amber ${schedule.autoFullscreen ? "on" : ""}`}
                onClick={() => saveSchedule({ ...schedule, autoFullscreen: !schedule.autoFullscreen })}
              >
                <span className="qs-switch-knob" />
              </button>
            </div>
          </div>
        )}
      </div>

      {windowsInfo && !windowsOk && (
        <div className="qs-card">
          <div className="nc-notice">
            <TriangleAlert size={15} strokeWidth={2.4} color="#FBBF24" style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="nc-notice-text">
              <div className="qs-row-title">
                Windows notifications unavailable
              </div>
              <div className="qs-row-sub">
                {windowsInfo.reason || "Lens can't read notifications from other apps yet."}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button type="button" className="nc-ghost-btn" disabled={busy} onClick={requestAccess}>
              {busy ? "Asking Windows…" : "Request access"}
            </button>
            <button
              type="button"
              className="nc-ghost-btn"
              onClick={() =>
                invoke("open_windows_setting_cmd", { uri: "ms-settings:privacy-notifications" }).catch(() => {})
              }
            >
              Open Windows settings
            </button>
          </div>
        </div>
      )}

      <div className="nc-toolbar">
        <div className="qs-section-label">
          Notifications{total > 0 ? ` · ${total}` : ""}
        </div>
        {aiOn && total > 2 && (
          <button
            type="button"
            className="nc-ghost-btn ai-chipbtn"
            onClick={() =>
              setDigest(
                notificationDigest(
                  groups.flatMap((g) => g.items).map((n) => ({ appName: n.appName, title: n.title, body: n.body, time: n.tsMs }))
                )
              )
            }
          >
            <Sparkles size={12} /> Summarise
          </button>
        )}
        <button type="button" className="nc-ghost-btn" disabled={total === 0} onClick={clearAll}>
          Clear all
        </button>
      </div>

      {digest && (
        <AskPanel
          key={digest.prompt}
          initialPrompt={digest.prompt}
          initialContext={digest.context}
          autoSend
          compact
          onClose={() => setDigest(null)}
        />
      )}

      {state && total === 0 && (
        <div className="nc-empty">
          <Bell size={20} strokeWidth={2.2} />
          <strong>You're all caught up</strong>
          <span>New notifications will be kept here.</span>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.key} className="nc-group">
          <div className="nc-group-head">
            <div className="nc-group-name">
              <GroupIcon category={group.category} source={group.source} />
              <span>{group.appName}</span>
              {group.items.length > 1 && <span className="nc-count">{group.items.length}</span>}
            </div>
            {group.items.length > 1 && (
              <button type="button" className="nc-ghost-btn" onClick={() => dismissGroup(group)}>
                Clear
              </button>
            )}
          </div>
          {(expanded.has(group.key) ? group.items : group.items.slice(0, GROUP_PREVIEW)).map((item) => (
            <div key={item.id} className="nc-item">
              <div className="nc-item-title">{item.title}</div>
              {item.body && <div className="nc-item-body">{item.body}</div>}
              <div className="nc-item-time">{formatWhen(item.tsMs, nowMs)}</div>
              <button
                type="button"
                className="nc-dismiss"
                aria-label={`Dismiss notification: ${item.title}`}
                onClick={() => dismiss(item)}
              >
                <X size={12} strokeWidth={2.6} />
              </button>
            </div>
          ))}
          {group.items.length > GROUP_PREVIEW && (
            <button
              type="button"
              className="nc-more"
              aria-expanded={expanded.has(group.key)}
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
            >
              {expanded.has(group.key) ? "Show less" : `Show ${group.items.length - GROUP_PREVIEW} more`}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
