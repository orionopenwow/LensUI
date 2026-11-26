import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logFail } from "../failsafe/calls";
import { Bell, ChevronUp, Volume2, Wifi } from "lucide-react";
import { TrayStrip } from "../components/TrayStrip";
import { KeyboardTopBarModule } from "../components/KeyboardLayoutModule";
import { BatteryIcon } from "../components/BatteryModule";
import { usePolled, type BatteryStatus } from "../components/SystemModuleShared";
import "./DockSystemArea.css";

const openQs = (tab: string) => invoke("open_quicksettings_tab_cmd", { tab, section: tab }).catch(logFail("Dock", "open Quick Settings"));

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export interface DockSystemAreaProps {
  trayHost: boolean;
  /** Total unread notifications (shows a dot on the bell). */
  unread: number;
  /** Dock on the left or right edge: stack vertically. */
  vertical: boolean;
  /** "bar" = Taskbar/Studio, "pill" = Split's own pill, "inline" = end of a centred Dock. */
  variant: "bar" | "pill" | "inline";
}

/**
 * The Dock's system area: tray icons, keyboard, Wi-Fi/volume/battery (one Quick Settings button),
 * clock/date (calendar) and notifications. Shown in the Dock instead of the Top Bar, never both.
 */
export const DockSystemArea: React.FC<DockSystemAreaProps> = ({ trayHost, unread, vertical, variant }) => {
  const now = useClock();
  const [battery] = usePolled<BatteryStatus>("get_battery_cmd", undefined, 60000);
  const hasBattery = !!battery?.hasBattery && battery.percent !== null;
  const fullTime = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Vertical bars are narrow: drop the AM/PM marker (the date line keeps it unambiguous enough).
  const time = vertical ? fullTime.replace(/\s*[ap]\.?\s?m\.?$/i, "") : fullTime;
  const date = vertical
    ? now.toLocaleDateString([], { month: "numeric", day: "numeric" })
    : now.toLocaleDateString([], { month: "numeric", day: "numeric", year: "numeric" });
  const iconPx = 16;

  return (
    <div className={`dock-sys dock-sys-${variant} ${vertical ? "is-vertical" : ""}`} role="group" aria-label="System">
      {!vertical && (
        <>
          <TrayStrip enabled={trayHost} />
          {!trayHost && (
            <button
              type="button"
              className="dock-sys-btn dock-sys-icon"
              aria-label="Show system tray for a few seconds"
              onClick={() => invoke("peek_native_taskbar_cmd", { seconds: 8 }).catch(logFail("Dock", "show the system tray"))}
            >
              <ChevronUp size={iconPx} strokeWidth={2.4} />
            </button>
          )}
          <KeyboardTopBarModule />
        </>
      )}
      <button
        type="button"
        className="dock-sys-btn dock-sys-quick"
        aria-label={`Quick Settings: Wi-Fi, volume${hasBattery ? `, battery ${battery?.percent} percent` : ""}`}
        onClick={() => openQs("quick")}
      >
        <Wifi size={iconPx} strokeWidth={2.4} />
        <Volume2 size={iconPx} strokeWidth={2.4} />
        {hasBattery && battery && <BatteryIcon s={battery} size={iconPx} />}
      </button>
      <button
        type="button"
        className="dock-sys-btn dock-sys-clock"
        aria-label={`${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}, ${fullTime}. Open calendar`}
        onClick={() => openQs("calendar")}
      >
        <span className="dock-sys-time">{time}</span>
        <span className="dock-sys-date">{date}</span>
      </button>
      <button
        type="button"
        className="dock-sys-btn dock-sys-icon dock-sys-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => openQs("notifications")}
      >
        <Bell size={iconPx} strokeWidth={2.4} />
        {unread > 0 && <span className="dock-sys-dot" />}
      </button>
    </div>
  );
};
