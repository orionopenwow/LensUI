/**
 * "Change automatically": on a timer, when Lens starts, and with a day set and a night set.
 * Used by the picker's Schedule panel and by Settings › Appearance › Wallpaper. It pauses with
 * the wallpaper itself: in fullscreen apps and games, while a window covers the desktop, and on
 * battery (the wallpaper host's own pause rules).
 */
import React from "react";
import { Toggle } from "../ui";
import type { AutoChange, SwitcherSettings } from "../types/generated";
import { INTERVALS, intervalLabel, type SourceOption } from "./model";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

export const AutoChangeControls: React.FC<{
  settings: SwitcherSettings;
  sources: SourceOption[];
  /** Simple mode: just the switch and how often. */
  simple?: boolean;
  onChange: (next: SwitcherSettings) => void;
}> = ({ settings, sources, simple, onChange }) => {
  const auto = settings.auto;
  const set = (patch: Partial<AutoChange>) => onChange({ ...settings, auto: { ...auto, ...patch } });
  const pickable = sources.filter((s) => s.id !== "hidden" && s.id !== "dupes" && s.id !== "live");
  const sourceSelect = (value: string, label: string, on: (v: string) => void) => (
    <select className="wsa-select" aria-label={label} value={value} onChange={(e) => on(e.target.value)}>
      {pickable.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label} ({s.count})
        </option>
      ))}
    </select>
  );
  return (
    <div className={`wsa ${auto.enabled ? "" : "is-off"}`} data-auto-change>
      <div className="wsa-line">
        <span id="wsa-on">
          Change automatically
          <small>Pauses in fullscreen apps and games, when the desktop is covered, and on battery.</small>
        </span>
        <Toggle labelledBy="wsa-on" checked={auto.enabled} onChange={(v) => set({ enabled: v })} />
      </div>
      <div className="wsa-more">
        <div className="wsa-line">
          <span>How often</span>
          <select className="wsa-select" aria-label="How often" value={auto.everyMinutes} onChange={(e) => set({ everyMinutes: Number(e.target.value) })}>
            <option value={0}>{intervalLabel(0)}</option>
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {intervalLabel(m)}
              </option>
            ))}
          </select>
        </div>
        {!simple && (
          <>
            <div className="wsa-line">
              <span id="wsa-signin">When Lens starts</span>
              <Toggle labelledBy="wsa-signin" checked={auto.atSignIn} onChange={(v) => set({ atSignIn: v })} />
            </div>
            <div className="wsa-line">
              <span>Order</span>
              <select className="wsa-select" aria-label="Order" value={auto.order} onChange={(e) => set({ order: e.target.value })}>
                <option value="random">Shuffled</option>
                <option value="inOrder">In order</option>
              </select>
            </div>
            <div className="wsa-line">
              <span id="wsa-daynight">
                A set for day, another for night
                <small>Mornings and evenings each get their own wallpapers.</small>
              </span>
              <Toggle labelledBy="wsa-daynight" checked={auto.dayNight} onChange={(v) => set({ dayNight: v })} />
            </div>
            {auto.dayNight ? (
              <>
                <div className="wsa-line">
                  <span>By day, from</span>
                  <span className="wsw-row">
                    {sourceSelect(auto.daySource, "Day set", (v) => set({ daySource: v }))}
                    <select className="wsa-select" aria-label="Day starts" value={auto.dayHour} onChange={(e) => set({ dayHour: Number(e.target.value) })}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="wsa-line">
                  <span>At night, from</span>
                  <span className="wsw-row">
                    {sourceSelect(auto.nightSource, "Night set", (v) => set({ nightSource: v }))}
                    <select className="wsa-select" aria-label="Night starts" value={auto.nightHour} onChange={(e) => set({ nightHour: Number(e.target.value) })}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              </>
            ) : (
              <div className="wsa-line">
                <span>Choose from</span>
                {sourceSelect(auto.source, "Choose from", (v) => set({ source: v }))}
              </div>
            )}
            <div className="wsa-line">
              <span>Crossfade</span>
              <select className="wsa-select" aria-label="Crossfade" value={auto.crossfadeMs} onChange={(e) => set({ crossfadeMs: Number(e.target.value) })}>
                <option value={0}>Cut</option>
                <option value={400}>Quick</option>
                <option value={900}>Smooth</option>
                <option value={2000}>Slow</option>
                <option value={4000}>Very slow</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
