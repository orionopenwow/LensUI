import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./TrayStrip.css";

export interface TrayIconInfo {
  id: string;
  tooltip: string;
  iconDataUrl?: string | null;
}

interface TrayStripProps {
  /** Mirrors the opt-in config flag. When false the strip renders nothing and stays idle. */
  enabled?: boolean;
  /** Icons beyond this count are hidden (oldest registrations stay visible). */
  maxIcons?: number;
}

type TrayButton = "left" | "right" | "double";

/**
 * Compact row of system tray icons for the Top Bar, fed by Lens' own tray host (win_tray.rs).
 * Left, right and double clicks are delivered to the owning app exactly as the Windows shell
 * would deliver them, so each app shows its own menu or window. Renders nothing when empty.
 */
export const TrayStrip: React.FC<TrayStripProps> = ({ enabled = true, maxIcons = 14 }) => {
  const [icons, setIcons] = useState<TrayIconInfo[]>([]);

  useEffect(() => {
    if (!enabled) {
      setIcons([]);
      return;
    }
    let alive = true;
    const refresh = () => {
      invoke<TrayIconInfo[]>("list_tray_icons_cmd")
        .then((list) => {
          if (alive) setIcons(list);
        })
        .catch(() => {});
    };
    refresh();
    const unlisten = listen<TrayIconInfo[]>("lens://tray-changed", (event) => {
      if (alive && Array.isArray(event.payload)) setIcons(event.payload);
    });
    return () => {
      alive = false;
      unlisten.then((fn) => fn());
    };
  }, [enabled]);

  if (!enabled || icons.length === 0) return null;

  const send = (icon: TrayIconInfo, button: TrayButton, e: React.MouseEvent) => {
    const scale = window.devicePixelRatio || 1;
    invoke("tray_icon_click_cmd", {
      id: icon.id,
      button,
      x: Math.round(e.screenX * scale),
      y: Math.round(e.screenY * scale),
    }).catch(() => {});
  };

  return (
    <div className="tray-strip" role="group" aria-label="System tray">
      {icons.slice(0, maxIcons).map((icon) => (
        <button
          key={icon.id}
          type="button"
          className="tray-strip-item"
          aria-label={icon.tooltip || "Tray icon"}
          onClick={(e) => {
            // The second click of a double-click is reported by onDoubleClick instead.
            if (e.detail <= 1) send(icon, "left", e);
          }}
          onDoubleClick={(e) => send(icon, "double", e)}
          onContextMenu={(e) => {
            e.preventDefault();
            send(icon, "right", e);
          }}
        >
          {icon.iconDataUrl ? (
            <img className="tray-strip-img" src={icon.iconDataUrl} alt="" draggable={false} />
          ) : (
            <span className="tray-strip-dot" />
          )}
        </button>
      ))}
    </div>
  );
};
