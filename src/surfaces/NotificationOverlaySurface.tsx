import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Bell, Calendar, Timer, Monitor, Sparkles, X } from "lucide-react";
import { useLensState } from "../hooks/useLensState";

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
        window.setTimeout(() => {
          invoke("hide_surface", { label: "notifications" }).catch(() => {});
        }, 160);
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
        appName: e.payload.appName || "Lens UI",
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
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 10,
        padding: 4,
      }}
    >
      <style>{`
        @keyframes lens-toast-in {
          from { opacity: 0; transform: translateX(26px) scale(0.97); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
      {items.map((n) => (
        <div
          key={n.id}
          onMouseEnter={() => hoveredRef.current.add(n.id)}
          onMouseLeave={() => hoveredRef.current.delete(n.id)}
          onClick={() => {
            if (n.category === "windows") {
              invoke("open_windows_setting_cmd", { uri: "ms-settings:notifications" }).catch(() => {});
            } else if (n.category === "calendar" || n.category === "timer") {
              invoke("open_quicksettings_tab_cmd", { tab: "calendar", section: "calendar" }).catch(() => {});
            }
            dismiss(n.id);
          }}
          style={{
            borderRadius: "var(--lens-radius, 14px)",
            background: "var(--lens-bg-surface)",
            backdropFilter: "blur(var(--lens-blur, 20px)) saturate(1.3)",
            border: "1px solid rgb(var(--lens-ink) / 0.14)",
            boxShadow: "0 14px 36px rgb(0 0 0 / calc(0.65 * var(--lens-shade-k, 1)))",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            cursor: "pointer",
            animation: "lens-toast-in 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  background: "rgb(var(--lens-ink) / 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CategoryIcon category={n.category} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--lens-fg-secondary)", letterSpacing: "0.02em" }}>
                {n.appName}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--lens-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                · {n.timeStr}
              </span>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(n.id);
              }}
              style={{
                color: "var(--lens-fg-muted)",
                padding: 3,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--lens-fg)", lineHeight: 1.25 }}>
            {n.title}
          </div>
          {n.body && (
            <div style={{ fontSize: 11.5, color: "var(--lens-fg-secondary)", lineHeight: 1.35 }}>
              {n.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
