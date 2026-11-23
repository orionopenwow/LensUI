import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { layoutDots, layoutPictogram, type WeatherKind } from "./glyphs";
import "./dotmatrix.css";

/** Text drawn as round LED dots. `color` defaults to the theme text token. */
export const DotText: React.FC<{
  text: string;
  /** Dot pitch in px (distance between dot centres). */
  pitch?: number;
  color?: string;
  /** Dim "off" dots behind the lit ones, like a real matrix. */
  ghost?: boolean;
  label?: string;
  className?: string;
}> = ({ text, pitch = 6, color = "var(--lens-fg)", ghost = false, label, className }) => {
  const { dots, cols } = useMemo(() => layoutDots(text), [text]);
  const r = pitch * 0.38;
  const w = Math.max(1, cols) * pitch;
  const h = 7 * pitch;
  return (
    <svg
      className={`ldm-text ${className ?? ""}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label ?? text}
    >
      {ghost &&
        Array.from({ length: cols * 7 }, (_, i) => (
          <circle key={`g${i}`} cx={(i % cols) * pitch + pitch / 2} cy={Math.floor(i / cols) * pitch + pitch / 2} r={r * 0.8} fill={color} opacity={0.08} />
        ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x * pitch + pitch / 2} cy={d.y * pitch + pitch / 2} r={r} fill={color} />
      ))}
    </svg>
  );
};

export const DotPictogram: React.FC<{ kind: WeatherKind; pitch?: number; color?: string }> = ({ kind, pitch = 4, color = "var(--lens-fg)" }) => {
  const { dots } = useMemo(() => layoutPictogram(kind), [kind]);
  const s = 7 * pitch;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={kind}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x * pitch + pitch / 2} cy={d.y * pitch + pitch / 2} r={pitch * 0.36} fill={color} />
      ))}
    </svg>
  );
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "07:32" (24 h) or " 7:32" style, for the big dot clock. */
export function clockText(d: Date, hour12 = false): string {
  let h = d.getHours();
  if (hour12) h = h % 12 || 12;
  return `${pad2(h)}:${pad2(d.getMinutes())}`;
}

/* ---------- Widget tiles ---------- */

export const DotTile: React.FC<{ wide?: boolean; tall?: boolean; pill?: boolean; label: string; children: React.ReactNode }> = ({
  wide,
  tall,
  pill,
  label,
  children,
}) => (
  <section className={`ldm-tile ${wide ? "is-wide" : ""} ${tall ? "is-tall" : ""} ${pill ? "is-pill" : ""}`} aria-label={label}>
    {children}
  </section>
);

export const BatteryTile: React.FC<{ percent: number; device?: string; charging?: boolean }> = ({ percent, device = "This PC", charging }) => (
  <DotTile label={`${device} battery ${Math.round(percent)}%`}>
    <div className="ldm-batt-icon" aria-hidden>
      <svg viewBox="0 0 24 24" width="26" height="26">
        <rect x="3" y="5" width="18" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 19h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className={`ldm-batt-badge ${charging ? "is-charging" : ""}`} />
    </div>
    <div className="ldm-batt-val">
      <DotText text={`${Math.round(percent)}%`} pitch={5} />
    </div>
  </DotTile>
);

export const MediaDiscTile: React.FC<{ playing?: boolean; pages?: number; page?: number; title?: string }> = ({ playing, pages = 2, page = 0, title }) => (
  <DotTile label={title ? `Now playing: ${title}` : "Media"}>
    <div className={`ldm-disc ${playing ? "is-playing" : ""}`} aria-hidden>
      <span className="ldm-disc-hole" />
    </div>
    <div className="ldm-pages" aria-hidden>
      {Array.from({ length: pages }, (_, i) => (
        <span key={i} className={i === page ? "on" : ""} />
      ))}
    </div>
  </DotTile>
);

export interface DayForecast {
  day: string;
  kind: WeatherKind;
  high: number;
  low: number;
}

export const WeatherCard: React.FC<{ temp: number; high: number; low: number; place: string; condition: string; days: DayForecast[] }> = ({
  temp,
  high,
  low,
  place,
  condition,
  days,
}) => (
  <DotTile wide label={`Weather in ${place}: ${Math.round(temp)} degrees, ${condition}`}>
    <div className="ldm-wx-top">
      <div className="ldm-wx-now">{Math.round(temp)}°</div>
      <div className="ldm-wx-hl">
        <span>↑ {Math.round(high)}°</span>
        <span>↓ {Math.round(low)}°</span>
      </div>
      <div className="ldm-wx-place">
        <div>{place}</div>
        <div className="ldm-dim">{condition}</div>
      </div>
    </div>
    <div className="ldm-wx-days">
      {days.slice(0, 6).map((d) => (
        <div key={d.day} className="ldm-wx-day">
          <span className="ldm-dim">{d.day.toUpperCase()}</span>
          <DotPictogram kind={d.kind} />
          <span>{Math.round(d.high)}°</span>
          <span className="ldm-dim ldm-small">{Math.round(d.low)}°</span>
        </div>
      ))}
    </div>
  </DotTile>
);

/** Ticks once a minute (aligned), so idle CPU stays near zero. */
function useMinuteClock(fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed) return;
    let t: number;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(t);
  }, [fixed]);
  return fixed ?? now;
}

export const BigClockTile: React.FC<{ now?: Date; hour12?: boolean }> = ({ now, hour12 }) => {
  const d = useMinuteClock(now);
  const t = clockText(d, hour12);
  return (
    <DotTile wide pill label={`Time ${t}`}>
      <div className="ldm-bigclock">
        <DotText text={t.slice(0, 2)} pitch={11} />
        <span className="ldm-colon" aria-hidden>
          <i />
          <i />
        </span>
        <DotText text={t.slice(3)} pitch={11} />
      </div>
    </DotTile>
  );
};

export const DateTile: React.FC<{ now?: Date }> = ({ now }) => {
  const d = useMinuteClock(now);
  const wd = d.toLocaleDateString(undefined, { weekday: "short" });
  return (
    <DotTile label={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}>
      <div className="ldm-date-wd">{wd}</div>
      <div className="ldm-date-num">{d.getDate()}</div>
      <span className="ldm-fold" aria-hidden />
    </DotTile>
  );
};

/** Minimal analogue: a single rounded hour hand plus an accent dot marking the minute. */
export const MinimalAnalogTile: React.FC<{ now?: Date }> = ({ now }) => {
  const d = useMinuteClock(now);
  const hour = ((d.getHours() % 12) + d.getMinutes() / 60) * 30;
  const minute = d.getMinutes() * 6;
  const rad = ((minute - 90) * Math.PI) / 180;
  return (
    <DotTile label={`Clock ${clockText(d)}`}>
      <svg className="ldm-analog" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="48" className="ldm-analog-face" />
        <line x1="50" y1="50" x2="50" y2="24" transform={`rotate(${hour} 50 50)`} className="ldm-analog-hand" />
        <circle cx={50 + 40 * Math.cos(rad)} cy={50 + 40 * Math.sin(rad)} r="3.2" className="ldm-analog-dot" />
      </svg>
    </DotTile>
  );
};

/* ---------- Top bar stat pills ---------- */

export interface StatValues {
  cpu?: number;
  tempC?: number | null;
  memUsedGb?: number;
  memTotalGb?: number;
}

export function formatStats(v: StatValues, now: Date): string[] {
  const out: string[] = [];
  if (typeof v.cpu === "number") out.push(`${Math.round(v.cpu)}%`);
  if (typeof v.tempC === "number") out.push(`${Math.round(v.tempC)}°C`);
  if (typeof v.memUsedGb === "number" && typeof v.memTotalGb === "number")
    out.push(`${v.memUsedGb.toFixed(1)}/${v.memTotalGb.toFixed(1)}GB`);
  out.push(
    `${now.getMonth() + 1}/${now.getDate()}/${String(now.getFullYear()).slice(2)} ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
  );
  return out;
}

const STAT_ICONS = ["cpu", "temp", "ram", "clock"] as const;
const StatIcon: React.FC<{ kind: (typeof STAT_ICONS)[number] }> = ({ kind }) => (
  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="ldm-stat-ico">
    {kind === "cpu" && <rect x="2.5" y="2.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />}
    {kind === "temp" && <path d="M6 1.5v6.2M4.4 9a1.6 1.6 0 1 0 3.2 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    {kind === "ram" && <path d="M1.5 4h9v4h-9zM4 8v1.5M8 8v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />}
    {kind === "clock" && <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3" />}
  </svg>
);

/**
 * A segmented capsule of live stats for the Top Bar. Reads `get_telemetry_cmd` every 3 s while visible.
 * CPU temperature is shown only when the caller passes it (Lens has no temperature sensor command yet).
 */
export const StatPills: React.FC<{ values?: StatValues; now?: Date; tempC?: number | null }> = ({ values, now, tempC }) => {
  const [live, setLive] = useState<StatValues>(values ?? {});
  const d = useMinuteClock(now);
  useEffect(() => {
    if (values) return;
    let stop = false;
    const poll = async () => {
      try {
        const t = await invoke<{ cpuUsage: number; memUsedGb: number; memTotalGb: number }>("get_telemetry_cmd");
        if (!stop) setLive({ cpu: t.cpuUsage, memUsedGb: t.memUsedGb, memTotalGb: t.memTotalGb });
      } catch {
        /* telemetry unavailable: keep last values */
      }
    };
    poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [values]);
  const merged = { ...live, tempC: tempC ?? live.tempC };
  const parts = formatStats(merged, d);
  const kinds: (typeof STAT_ICONS)[number][] = [];
  if (typeof merged.cpu === "number") kinds.push("cpu");
  if (typeof merged.tempC === "number") kinds.push("temp");
  if (typeof merged.memUsedGb === "number" && typeof merged.memTotalGb === "number") kinds.push("ram");
  kinds.push("clock");
  return (
    <div className="ldm-stats" role="group" aria-label="System stats">
      {parts.map((p, i) => (
        <span key={i} className="ldm-stat">
          <StatIcon kind={kinds[i]} />
          <span>{p}</span>
        </span>
      ))}
    </div>
  );
};
