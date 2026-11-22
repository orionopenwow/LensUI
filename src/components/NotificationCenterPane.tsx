import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Bell, BellOff, Calendar, Monitor, Sparkles, Timer, TriangleAlert, X } from "lucide-react";
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

  return (
    <div key="pane-notifications" className="qs-pane">
      <div className="qs-card">
        <div className="qs-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dnd ? (
              <BellOff size={15} strokeWidth={2.4} color="#FBBF24" />
            ) : (
              <Bell size={15} strokeWidth={2.4} />
            )}
            <div>
              <div className="qs-row-title">Do Not Disturb</div>
              <div className="qs-row-sub">
                {dnd ? "Pop-ups are paused. Timers still alert." : "Notifications pop up as they arrive."}
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
                {windowsInfo.reason || "Lens UI can't read notifications from other apps yet."}
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
        <button type="button" className="nc-ghost-btn" disabled={total === 0} onClick={clearAll}>
          Clear all
        </button>
      </div>

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
          {group.items.map((item) => (
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
        </div>
      ))}
    </div>
  );
};
