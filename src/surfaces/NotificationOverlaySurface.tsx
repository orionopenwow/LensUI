import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { hideSurface } from "../failsafe/calls";
import { magicOpenFor } from "../magic/contract";
import { emit, listen } from "@tauri-apps/api/event";
import { Bell, Calendar, Music, Timer, Monitor, Sparkles, RotateCw, X } from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import { PresenceList, duration } from "../ui/motion";
import "./NotificationOverlaySurface.css";

interface LensNotification {
  id: string;
  title: string;
  body: string;
  appName: string;
  category: "calendar" | "timer" | "windows" | "system" | string;
  timeStr: string;
  /** Buttons under the text (the Spotify question). A toast with buttons stays up longer. */
  actions?: NotificationAction[];
}

interface NotificationAction {
  id: string;
  label: string;
}

/** What each known button does. Unknown ids just dismiss. */
function runAction(id: string) {
  if (id === "music.overlay.yes" || id === "music.overlay.no") {
    invoke("music_spotify_overlay_answer", { yes: id === "music.overlay.yes" }).catch(() => {});
  }
}

/** Plain toasts leave after 5.5 s; a question waits longer for an answer. */
export const TOAST_MS = 5500;
export const QUESTION_MS = 20000;

function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case "calendar":
      return <Calendar size={16} strokeWidth={2.3} color="#FBBF24" />;
    case "timer":
      return <Timer size={16} strokeWidth={2.3} color="#34D399" />;
    case "windows":
      return <Monitor size={16} strokeWidth={2.3} color="#60A5FA" />;
    case "theme":
      return <Sparkles size={16} strokeWidth={2.3} color="#A78BFA" />;
    case "update":
      return <RotateCw size={16} strokeWidth={2.3} color="#34D399" />;
    case "music":
      return <Music size={16} strokeWidth={2.3} color="#1DB954" />;
    default:
      return <Bell size={16} strokeWidth={2.3} color="#38BDF8" />;
  }
}

export const NotificationOverlaySurface: React.FC = () => {
  useLensState();
  const [items, setItems] = useState<LensNotification[]>([]);
  const hoveredRef = useRef<Set<string>>(new Set());

  const dismiss = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (next.length === 0) {
        // The last toast glides out first (exit duration), then the window is hidden.
        window.setTimeout(() => {
          void hideSurface("notifications");
        }, duration("exit") + 80);
      }
      return next;
    });
  };

  useEffect(() => {
    const unlisten = listen<{
      id: string;
      title: string;
      body: string;
      appName?: string;
      category?: string;
      actions?: NotificationAction[];
    }>("lens://notification", (e) => {
      const dnd = localStorage.getItem("lens_dnd") === "1";
      if (dnd && e.payload.category !== "timer") {
        void hideSurface("notifications");
        return;
      }
      const n: LensNotification = {
        id: e.payload.id || `n-${Date.now()}`,
        title: e.payload.title,
        body: e.payload.body,
        appName: e.payload.appName || "Lens",
        category: e.payload.category || "system",
        timeStr: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        actions: Array.isArray(e.payload.actions) ? e.payload.actions.slice(0, 2) : undefined,
      };

      setItems((prev) => [...prev.slice(-3), n]);

      window.setTimeout(() => {
        if (!hoveredRef.current.has(n.id)) {
          dismiss(n.id);
        } else {
          const check = window.setInterval(() => {
            if (!hoveredRef.current.has(n.id)) {
              window.clearInterval(check);
              dismiss(n.id);
            }
          }, 800);
        }
      }, n.actions?.length ? QUESTION_MS : TOAST_MS);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <PresenceList
      className="nt-stack"
      itemClassName="nt-slot"
      items={items}
      getKey={(n) => n.id}
      enter={{ x: 26, scale: 0.97, opacity: 0 }}
      exit={{ x: 18, scale: 0.98, opacity: 0 }}
    >
      {(n) => (
        <div
          className="nt-toast"
          onMouseEnter={() => hoveredRef.current.add(n.id)}
          onMouseLeave={() => hoveredRef.current.delete(n.id)}
          onContextMenu={(e) => {
            // Right-click a notification: the magic window, with this notification as its target.
            e.preventDefault();
            magicOpenFor("notification", n.id, `${n.appName}: ${n.title}`);
          }}
          onClick={() => {
            if (n.category === "windows") {
              invoke("open_windows_setting_cmd", { uri: "ms-settings:notifications" }).catch(() => {});
            } else if (n.category === "calendar" || n.category === "timer") {
              invoke("open_quicksettings_tab_cmd", { tab: "calendar", section: "calendar" }).catch(() => {});
            } else if (n.category === "update") {
              // "Lens 0.3.1 is ready": Settings › About & Testing › Updates has what's new and
              // Restart to update.
              invoke("open_surface", { label: "settings" })
                .then(() => emit("lens://settings-tab", "about#updates"))
                .catch(() => {});
            } else if (n.category === "failsafe") {
              // Lens paused or repaired something: Settings › About & Testing › Safety net has
              // the details and "Turn back on".
              invoke("open_surface", { label: "settings" })
                .then(() => emit("lens://settings-tab", "about"))
                .catch(() => {});
            }
            dismiss(n.id);
          }}
        >
          <div className="nt-head">
            <div className="nt-source">
              <span className="nt-icon">
                <CategoryIcon category={n.category} />
              </span>
              <span className="nt-app">{n.appName}</span>
              <span className="nt-time lens-num">· {n.timeStr}</span>
            </div>
            <button
              type="button"
              className="nt-close"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(n.id);
              }}
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>
          <div className="nt-title">{n.title}</div>
          {n.body && <div className="nt-body">{n.body}</div>}
          {n.actions && n.actions.length > 0 && (
            <div className="nt-actions">
              {n.actions.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  data-weight={i === 0 ? "heavy" : "medium"}
                  className={`nt-action ${i === 0 ? "is-primary" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    runAction(a.id);
                    dismiss(n.id);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </PresenceList>
  );
};
