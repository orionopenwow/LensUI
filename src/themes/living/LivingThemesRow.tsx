/**
 * Theme & Look → Living themes: live tiles for the nine living packs, location, a time-lapse
 * scrubber for the previews, "Tint Lens with the sky", motion and weather. See docs/LIVING_THEMES.md.
 */
import "./living.css";
import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../../types/lens";
import type { WallpaperState } from "../../surfaces/wallpaperTypes";
import { applyThemePack } from "../packs";
import { readSchedule } from "../schedule";
import { PlaygroundView } from "../../playground/PlaygroundView";
import { setSkyLocation } from "../../playground/scenes/skyclock";
import {
  CITIES,
  onLivingChange,
  parseLocation,
  readLiving,
  resolveLocation,
  setPreviewTime,
  systemTimeZone,
  writeLiving,
  type LivingSettings,
} from "../../playground/living/settings";
import { clearWeatherCache } from "../../playground/living/weather";
import type { WeatherKind } from "../../playground/living/sky";
import { LIVING_PACKS } from "./packs";

interface Props {
  config: LensConfig;
  onApplyPack: (next: LensConfig) => void;
  /** Visible on screen (previews pause otherwise). */
  visible?: boolean;
}

const WEATHERS: { id: WeatherKind; label: string }[] = [
  { id: "clear", label: "Clear" },
  { id: "cloudy", label: "Cloudy" },
  { id: "rain", label: "Rain" },
  { id: "snow", label: "Snow" },
  { id: "fog", label: "Fog" },
  { id: "storm", label: "Storm" },
];

const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.floor(min % 60)).padStart(2, "0")}`;

export function useLiving(): [LivingSettings, (p: Partial<LivingSettings>) => void] {
  const [s, setS] = useState(readLiving);
  useEffect(() => onLivingChange(setS), []);
  return [s, (p) => setS(writeLiving(p))];
}

/** Today at `minutes` past local midnight. */
function todayAt(minutes: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + minutes * 60_000);
}

export const LivingThemesRow: React.FC<Props> = ({ config, onApplyPack, visible = true }) => {
  const [s, set] = useLiving();
  const [alsoWallpaper, setAlsoWallpaper] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [locText, setLocText] = useState(s.location.mode === "manual" ? s.location.label : "");
  const [locError, setLocError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const raf = useRef(0);

  // The previews use the same location as the wallpaper: the Theme Schedule's, when set.
  const sched = readSchedule(config);
  useEffect(() => setSkyLocation(sched.latitude, sched.longitude), [sched.latitude, sched.longitude]);
  const loc = resolveLocation(s);

  // Scrubber -> preview time for the tiles in this window only.
  useEffect(() => {
    setPreviewTime(scrub === null ? null : todayAt(scrub));
  }, [scrub]);
  useEffect(() => () => setPreviewTime(null), []);

  // "Play a day": 24 hours in 10 seconds.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const from = scrub ?? 0;
    const tick = (now: number) => {
      const m = (from + ((now - start) / 10_000) * 1440) % 1440;
      setScrub(m);
      if (now - start < 10_000) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const choose = async (id: string) => {
    onApplyPack(applyThemePack(config, id));
    if (!alsoWallpaper) return;
    try {
      const st = await invoke<WallpaperState>("get_wallpaper_state_cmd");
      const next = { ...st.settings, enabled: true, scene: id };
      await invoke<WallpaperState>("set_wallpaper_settings_cmd", { settings: next });
      setStatus(null);
    } catch (e) {
      setStatus(`Theme applied; the wallpaper could not be changed (${String(e)}).`);
    }
  };

  const saveLocation = () => {
    const p = parseLocation(locText);
    if (!p) {
      setLocError("Type a city from the list, or latitude, longitude (e.g. 51.5, -0.1).");
      return;
    }
    setLocError(null);
    setLocText(p.label);
    set({ location: { mode: "manual", ...p } });
  };

  const sourceLabel =
    loc.source === "manual" ? s.location.label : loc.source === "schedule" ? "Theme Schedule location" : `time zone ${systemTimeZone() ?? "unknown"}`;

  return (
    <section className="tux-block lv-row" aria-label="Living themes">
      <div className="tux-block-head">
        <div className="tux-h2">Living themes</div>
        <span className="tux-help">Wallpaper and colours that follow the real Sun and Moon where you are.</span>
      </div>

      <div className="lv-tiles" role="radiogroup" aria-label="Living theme">
        {LIVING_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            className={`lv-tile ${config.theme.preset === p.id ? "active" : ""}`}
            aria-checked={config.theme.preset === p.id}
            aria-label={`${p.label}: ${p.description ?? ""}`}
            onClick={() => choose(p.id)}
          >
            {/* data-live: the tiles show the live sky, so visual tests mask them. */}
            <span className="lv-tile-canvas" aria-hidden="true" data-live="">
              <PlaygroundView sceneId={p.id} preview fps={15} dprCap={1} paused={!visible} seed={7} />
            </span>
            <span className="lv-tile-label">{p.label}</span>
          </button>
        ))}
      </div>
      <label className="tux-check">
        <input type="checkbox" checked={alsoWallpaper} onChange={(e) => setAlsoWallpaper(e.target.checked)} />
        <span>
          Also set the living wallpaper
          <span className="tux-help"> Turns on the Lens wallpaper with the matching scene. Your Windows wallpaper is never changed.</span>
        </span>
      </label>

      <div className="lv-scrub" aria-label="Time-lapse">
        <div className="tux-field-label">Preview time</div>
        <input
          type="range"
          min={0}
          max={1439}
          step={1}
          value={scrub ?? new Date().getHours() * 60 + new Date().getMinutes()}
          aria-label="Preview time of day"
          aria-valuetext={scrub === null ? "Now" : fmt(scrub)}
          onChange={(e) => {
            setPlaying(false);
            setScrub(Number(e.target.value));
          }}
        />
        <span className="lv-scrub-time">{scrub === null ? "Now" : fmt(scrub)}</span>
        <button type="button" className="cc-btn-ghost tux-small-btn" onClick={() => setPlaying((v) => !v)}>
          {playing ? "Pause" : "Play a day"}
        </button>
        <button type="button" className="cc-btn-ghost tux-small-btn" disabled={scrub === null} onClick={() => { setPlaying(false); setScrub(null); }}>
          Now
        </button>
      </div>

      <div className="lv-grid">
        <div className="tux-field">
          <div className="tux-field-label">Location</div>
          <div className="cc-chip-grid" role="radiogroup" aria-label="Location">
            {(["auto", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={s.location.mode === m}
                className={`cc-chip tux-chip ${s.location.mode === m ? "active" : ""}`}
                onClick={() => (m === "auto" ? set({ location: { ...s.location, mode: "auto" } }) : set({ location: { ...s.location, mode: "manual" } }))}
              >
                {m === "auto" ? "Automatic" : "Choose"}
              </button>
            ))}
          </div>
          {s.location.mode === "manual" && (
            <div className="lv-loc">
              <input
                className="cc-input"
                list="lv-cities"
                value={locText}
                placeholder="City, or 51.5, -0.1"
                aria-label="City or latitude, longitude"
                onChange={(e) => setLocText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveLocation()}
              />
              <datalist id="lv-cities">
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
              <button type="button" className="cc-btn-ghost tux-small-btn" onClick={saveLocation}>
                Use
              </button>
            </div>
          )}
          {locError && <div className="lv-error" role="alert">{locError}</div>}
          <div className="tux-help">
            Using {sourceLabel} ({loc.latitude.toFixed(1)}, {loc.longitude.toFixed(1)}). Stored on this PC only.
          </div>
        </div>

        <div className="tux-field">
          <div className="tux-field-label">Motion</div>
          <div className="cc-chip-grid" role="radiogroup" aria-label="Motion">
            {(["still", "subtle"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={s.motion === m} className={`cc-chip tux-chip ${s.motion === m ? "active" : ""}`} onClick={() => set({ motion: m })}>
                {m === "still" ? "Still" : "Subtle"}
              </button>
            ))}
          </div>
          <div className="tux-help">Still repaints once a minute. Subtle twinkles and drifts at up to 10 fps.</div>
        </div>
      </div>

      <label className="tux-check">
        <input type="checkbox" checked={s.tint} onChange={(e) => set({ tint: e.target.checked })} />
        <span>
          Tint Lens with the sky
          <span className="tux-help"> Glass and accent follow the sky's colour, at most once a minute and never while a fullscreen app or game covers the desktop. Text always keeps 4.5:1 contrast.</span>
        </span>
      </label>
      <label className="tux-check">
        <input type="checkbox" checked={s.clouds} onChange={(e) => set({ clouds: e.target.checked })} />
        <span>Slow high clouds</span>
      </label>
      <label className="tux-check">
        <input type="checkbox" checked={s.spanMonitors} onChange={(e) => set({ spanMonitors: e.target.checked })} />
        <span>
          One sky across all monitors
          <span className="tux-help"> Each screen shows its own slice of one continuous sky.</span>
        </span>
      </label>

      <div className="tux-field">
        <div className="tux-field-label">Weather Window</div>
        <label className="tux-check">
          <input
            type="checkbox"
            checked={s.weather.online}
            onChange={(e) => {
              if (!e.target.checked) clearWeatherCache();
              set({ weather: { ...s.weather, online: e.target.checked } });
            }}
          />
          <span>
            Use live weather (Open-Meteo)
            <span className="tux-help"> Off by default. Sends only your location rounded to 0.1° (about 11 km) to api.open-meteo.com, at most twice an hour. No account or key.</span>
          </span>
        </label>
        {!s.weather.online && (
          <div className="cc-chip-grid" role="radiogroup" aria-label="Weather">
            {WEATHERS.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={s.weather.manual === w.id}
                className={`cc-chip tux-chip ${s.weather.manual === w.id ? "active" : ""}`}
                onClick={() => set({ weather: { ...s.weather, manual: w.id } })}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {status && <div className="lv-error" role="status">{status}</div>}
    </section>
  );
};
