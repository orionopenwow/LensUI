import React from "react";
import type { LensConfig } from "../types/lens";
import { allPacks } from "../themes/packs";
import { readSchedule, sunTimes, type ThemeSchedule } from "../themes/schedule";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

/** Day pack / night pack, switched at fixed times or at local sunrise and sunset. */
export const ThemeScheduleCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const schedule = readSchedule(config);
  const packs = allPacks();

  const patch = (change: Partial<ThemeSchedule>) =>
    onUpdateConfig({ ...config, themeSchedule: { ...schedule, ...change } } as LensConfig);

  const sun = schedule.mode === "sun" ? sunTimes(new Date(), schedule.latitude, schedule.longitude) : null;

  const packSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <select
      className="cc-input"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1, minWidth: 0 }}
    >
      {packs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );

  const coordinate = (value: number, limit: number, label: string, onChange: (v: number) => void) => (
    <input
      className="cc-input"
      type="number"
      aria-label={label}
      placeholder={label}
      min={-limit}
      max={limit}
      step="0.01"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.max(-limit, Math.min(limit, v)));
      }}
      style={{ width: 104 }}
    />
  );

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Day &amp; night themes</div>
          <div className="cc-desc">Switch packs automatically. A pack you pick by hand stays until the next switch.</div>
        </div>
        <button data-weight="light"
          type="button"
          aria-label="Switch themes automatically"
          aria-pressed={schedule.enabled}
          className={`cc-toggle ${schedule.enabled ? "on" : ""}`}
          onClick={() => patch({ enabled: !schedule.enabled })}
        />
      </div>

      {schedule.enabled && (
        <>
          <div className="cc-row">
            <div className="cc-label">Day</div>
            <div style={{ display: "flex", gap: 8, flex: 1, maxWidth: 320 }}>
              {packSelect(schedule.dayPack, (id) => patch({ dayPack: id }), "Day theme")}
            </div>
          </div>
          <div className="cc-row">
            <div className="cc-label">Night</div>
            <div style={{ display: "flex", gap: 8, flex: 1, maxWidth: 320 }}>
              {packSelect(schedule.nightPack, (id) => patch({ nightPack: id }), "Night theme")}
            </div>
          </div>

          <div className="cc-row">
            <div className="cc-label">Switch at</div>
            <div className="cc-chip-grid">
              <button data-weight="light"
                type="button"
                className={`cc-chip ${schedule.mode === "fixed" ? "active" : ""}`}
                onClick={() => patch({ mode: "fixed" })}
              >
                Set Times
              </button>
              <button data-weight="light"
                type="button"
                className={`cc-chip ${schedule.mode === "sun" ? "active" : ""}`}
                onClick={() => patch({ mode: "sun" })}
              >
                Sunrise &amp; Sunset
              </button>
            </div>
          </div>

          {schedule.mode === "fixed" ? (
            <div className="cc-row">
              <div className="cc-desc">Day starts · Night starts</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="cc-input"
                  type="time"
                  aria-label="Day starts"
                  value={schedule.dayStart}
                  onChange={(e) => e.target.value && patch({ dayStart: e.target.value })}
                />
                <input
                  className="cc-input"
                  type="time"
                  aria-label="Night starts"
                  value={schedule.nightStart}
                  onChange={(e) => e.target.value && patch({ nightStart: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="cc-row">
                <div>
                  <div className="cc-desc">Your location (worked out on this PC, never sent anywhere)</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {coordinate(schedule.latitude, 90, "Latitude", (v) => patch({ latitude: v }))}
                  {coordinate(schedule.longitude, 180, "Longitude", (v) => patch({ longitude: v }))}
                </div>
              </div>
              <div className="cc-desc">
                {sun?.polar === "day"
                  ? "The sun doesn't set today at this location, so the day theme stays on."
                  : sun?.polar === "night"
                    ? "The sun doesn't rise today at this location, so the night theme stays on."
                    : `Today: sunrise ${clock(sun?.sunrise ?? null)} · sunset ${clock(sun?.sunset ?? null)}`}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
