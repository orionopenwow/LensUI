import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Bell, Calendar, Timer, Monitor, Sparkles, X } from "lucide-react";
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
}

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
          invoke("hide_surface", { label: "notifications" }).catch(() => {});
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
    }>("lens://notification", (e) => {
      const dnd = localStorage.getItem("lens_dnd") === "1";
      if (dnd && e.payload.category !== "timer") {
        invoke("hide_surface", { label: "notifications" }).catch(() => {});
        return;
      }
      const n: LensNotification = {
        id: e.payload.id || `n-${Date.now()}`,
        title: e.payload.title,
        body: e.payload.body,
        appName: e.payload.appName || "Lens",
        category: e.payload.category || "system",
        timeStr: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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
      }, 5500);
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
          onClick={() => {
            if (n.category === "windows") {
              invoke("open_windows_setting_cmd", { uri: "ms-settings:notifications" }).catch(() => {});
            } else if (n.category === "calendar" || n.category === "timer") {
              invoke("open_quicksettings_tab_cmd", { tab: "calendar", section: "calendar" }).catch(() => {});
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
        </div>
      )}
    </PresenceList>
  );
};
