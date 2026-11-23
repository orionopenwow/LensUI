import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../types/lens";

/** Mirrors win_monitors::MonitorInfo. */
interface MonitorInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  primary: boolean;
}

type MonitorFunc = { targetMonitor?: string; perMonitorBars?: boolean };

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
  /** Show the "Top Bar on every monitor" switch (only once the backend supports it). */
  showPerMonitorBars?: boolean;
}

/** Control Center card: which monitor the Dock and Top Bar live on. */
export const MonitorPickerCard: React.FC<Props> = ({ config, onUpdateConfig, showPerMonitorBars = false }) => {
  const func = config.func as LensConfig["func"] & MonitorFunc;
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const target = (func.targetMonitor ?? "primary").trim() || "primary";

  useEffect(() => {
    invoke<MonitorInfo[]>("list_monitors_cmd")
      .then((m) => setMonitors(Array.isArray(m) ? m : []))
      .catch(() => setMonitors([]));
  }, []);

  const choose = (id: string) =>
    onUpdateConfig({ ...config, func: { ...config.func, targetMonitor: id } as LensConfig["func"] });

  const targetMissing =
    target !== "primary" && monitors.length > 0 && !monitors.some((m) => m.id.toLowerCase() === target.toLowerCase());

  if (monitors.length <= 1 && !targetMissing) {
    return (
      <div className="cc-card" style={{ gap: 10, padding: "12px 14px" }}>
        <div className="cc-label">Monitor</div>
        <div className="cc-desc">One display connected — the Dock and Top Bar are on it.</div>
      </div>
    );
  }

  return (
    <div className="cc-card" style={{ gap: 10, padding: "12px 14px" }}>
      <div className="cc-label">Monitor</div>
      <div className="cc-desc">Where the Dock and Top Bar live. If that display is unplugged they move to the main one.</div>
      <div className="cc-chip-grid" role="radiogroup" aria-label="Monitor for the Dock and Top Bar">
        <button
          type="button"
          role="radio"
          aria-checked={target === "primary"}
          className={`cc-chip ${target === "primary" ? "active" : ""}`}
          onClick={() => choose("primary")}
        >
          Main display
        </button>
        {monitors.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={target.toLowerCase() === m.id.toLowerCase()}
            className={`cc-chip ${target.toLowerCase() === m.id.toLowerCase() ? "active" : ""}`}
            onClick={() => choose(m.id)}
          >
            {m.name || `Display ${i + 1}`}
            {m.primary ? " · main" : ""}
          </button>
        ))}
      </div>
      {targetMissing && (
        <div className="cc-desc">The chosen display isn't connected, so the main display is used for now.</div>
      )}
      {showPerMonitorBars && (
        <div className="cc-row">
          <div>
            <div className="cc-label">Top Bar on Every Monitor</div>
            <div className="cc-desc">Show a Top Bar on each display. Applies after restarting Lens UI.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!func.perMonitorBars}
            aria-label="Top Bar on every monitor"
            className={`cc-toggle ${func.perMonitorBars ? "on" : ""}`}
            onClick={() =>
              onUpdateConfig({
                ...config,
                func: { ...config.func, perMonitorBars: !func.perMonitorBars } as LensConfig["func"],
              })
            }
          />
        </div>
      )}
    </div>
  );
};
