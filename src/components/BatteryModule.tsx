import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Gauge,
  Leaf,
  Zap,
} from "lucide-react";
import { formatDuration, usePolled, type BatteryStatus } from "./SystemModuleShared";
import { fillStyle } from "../ui/motion";

export function BatteryIcon({ s, size = 16 }: { s: BatteryStatus; size?: number }) {
  const p = { size, strokeWidth: 2.3 };
  if (s.charging) return <BatteryCharging {...p} />;
  const pct = s.percent ?? 0;
  if (s.percent === null) return <Battery {...p} />;
  if (pct <= 10) return <BatteryWarning {...p} />;
  if (pct <= 30) return <BatteryLow {...p} />;
  if (pct <= 75) return <BatteryMedium {...p} />;
  return <BatteryFull {...p} />;
}

const MODES: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "efficiency", label: "Efficiency", icon: <Leaf size={12} strokeWidth={2.5} /> },
  { id: "balanced", label: "Balanced", icon: <Gauge size={12} strokeWidth={2.5} /> },
  { id: "performance", label: "Performance", icon: <Zap size={12} strokeWidth={2.5} /> },
];

/** Battery level, charging state, time left and the Windows power mode. Renders nothing on a
 *  desktop where neither a battery nor the power mode is available. */
export const BatteryModule: React.FC = () => {
  const [s, , , setS] = usePolled<BatteryStatus>("get_battery_cmd", undefined, 30000);
  const [error, setError] = useState<string | null>(null);

  if (!s || (!s.hasBattery && !s.powerModeSupported)) return null;

  const setMode = (mode: string) => {
    if (mode === s.powerMode) return;
    setError(null);
    setS({ ...s, powerMode: mode });
    invoke<BatteryStatus>("set_power_mode_cmd", { mode })
      .then(setS)
      .catch((e) => setError(String(e)));
  };

  const pct = s.percent ?? 0;
  const detail = !s.hasBattery
    ? "Plugged in"
    : s.charging
      ? "Charging"
      : s.pluggedIn
        ? "Plugged in, not charging"
        : s.secondsLeft !== null
          ? `${formatDuration(s.secondsLeft)} left`
          : "On battery";

  return (
    <div className="sysmod-card">
      {s.hasBattery && (
        <>
          <div className="sysmod-head">
            <div className="sysmod-head-left">
              <span style={{ color: pct <= 20 && !s.charging ? "#fbbf24" : "#34D399", display: "inline-flex" }}>
                <BatteryIcon s={s} />
              </span>
              <span className="sysmod-battery-big">{s.percent !== null ? `${pct}%` : "—"}</span>
              <span className="sysmod-sub">{detail}</span>
            </div>
            {s.batterySaver && <span className="sysmod-badge">Battery saver</span>}
          </div>
          <div className="sysmod-meter" aria-hidden="true">
            <div
              className={`sysmod-meter-fill ${pct <= 10 ? "is-critical" : pct <= 20 ? "is-low" : ""}`}
              style={fillStyle(Math.max(2, pct) / 100)}
            />
          </div>
        </>
      )}
      {s.powerModeSupported && (
        <>
          {!s.hasBattery && <div className="sysmod-title">Power mode</div>}
          <div className="sysmod-seg" role="radiogroup" aria-label="Power mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={s.powerMode === m.id}
                className={`sysmod-seg-btn ${s.powerMode === m.id ? "active" : ""}`}
                onClick={() => setMode(m.id)}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {error && <div className="sysmod-error">{error}</div>}
    </div>
  );
};

/** Compact Top Bar battery indicator: icon + percent. Hidden on PCs without a battery. */
export const BatteryTopBarModule: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const [s] = usePolled<BatteryStatus>("get_battery_cmd", undefined, 60000);
  if (!s || !s.hasBattery) return null;
  const low = (s.percent ?? 100) <= 20 && !s.charging;
  return (
    <button
      type="button"
      className="sysmod-tb-battery"
      onClick={onClick}
      aria-label={`Battery ${s.percent ?? "unknown"} percent${s.charging ? ", charging" : ""}`}
      style={low ? { color: "#fbbf24" } : undefined}
    >
      <BatteryIcon s={s} size={16} />
      {s.percent !== null && <span>{s.percent}%</span>}
    </button>
  );
};
