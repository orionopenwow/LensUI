// The built-in desktop widgets (docs/features/desktop-widgets.md). Each is a small component with
// three sizes that reads Lens's own local data on the shared tick (tick.ts): no widget starts a
// timer of its own, and nothing fetches except a Dashboard gallery widget the person approved
// (Lens fetches it, under the Dashboard's rules). `preview` renders invented sample data for the
// gallery, with no backend calls.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BatteryCharging, Check, Music, Pause, Play, Plug, SkipBack, SkipForward, StickyNote } from "lucide-react";
import type { BatteryStatus, MediaNowPlaying } from "../types/generated";
import { fillStyle, glide } from "../ui/motion";
import { reducedMotion } from "../ui/motion/tokens";
import { weatherWords, galleryDef } from "../widgets/gallery";
import { widgetsApi, type WidgetInstance, type WidgetStore } from "../widgets/api";
import { useWidgetCard } from "../widgets/WidgetsLane";
import { AdaptiveCard } from "../widgets/AdaptiveCard";
import { EVT_SHELF_CHANGED, type ShelfInfo, type ShelfItem } from "../shelf/contract";
import { NOTES_SHELF_NAME } from "../coreapps/models/notes";
import type { Size } from "./grid";
import { useEvery, useTick } from "./tick";
import {
  CALENDAR_KEY, cityOf, handAngles, hhmm, offsetLabel, parseZones, readCalendar, ringDash, secondDelay, tickOff, timeIn, timeLeft, todayOpen,
  weatherFrom, monthGrid, weekStart, weekdayLetters, type CalEvent, type WeatherNow,
} from "./model";

export interface WidgetProps {
  size: Size;
  params: Record<string, string>;
  /** Sample data, no calls (gallery previews and the parity harness's preview). */
  preview?: boolean;
  /** The person's Dashboard widgets (weather and gallery kinds pick one of these). */
  store?: WidgetStore | null;
}

const quiet = () => {};
const sweepStyle = (delay: string): React.CSSProperties => ({ animationDelay: delay });

// ---- Clock --------------------------------------------------------------------------------------

const Dial: React.FC<{ zone: string; now: Date; big?: boolean; label?: string }> = ({ zone, now, big, label }) => {
  const t = timeIn(now, zone);
  const a = handAngles(t);
  const night = t.h < 6 || t.h >= 19;
  const reduce = reducedMotion();
  // The second hand sweeps by itself (one CSS animation); it's started at the current second each
  // minute, so it never drifts and needs no per-second render.
  const delay = useMemo(() => secondDelay(now), [now.getMinutes()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`dwc-dial${big ? " is-big" : ""}${night ? " is-night" : ""}`} role="img" aria-label={`${label ?? cityOf(zone)} ${hhmm(t)}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} className={i % 3 === 0 ? "dwc-tick is-major" : "dwc-tick"} x1="50" y1="6" x2="50" y2={i % 3 === 0 ? 13 : 10} transform={`rotate(${i * 30} 50 50)`} />
        ))}
        <line className="dwc-hand is-hour" x1="50" y1="52" x2="50" y2="28" transform={`rotate(${a.hour} 50 50)`} />
        <line className="dwc-hand is-minute" x1="50" y1="54" x2="50" y2="15" transform={`rotate(${a.minute} 50 50)`} />
        {!reduce && zone === "local" && (
          <g className="dwc-sweep" style={sweepStyle(delay)}>
            <line className="dwc-hand is-second" x1="50" y1="58" x2="50" y2="12" />
          </g>
        )}
        <circle className="dwc-pin" cx="50" cy="50" r="2.4" />
      </svg>
    </div>
  );
};

export const ClockWidget: React.FC<WidgetProps> = ({ size, params, preview }) => {
  const live = useTick("minute");
  const now = preview ? new Date(2026, 0, 15, 10, 9, 30) : live;
  const zones = parseZones(params.zones);
  if (size === "small") {
    return (
      <div className="dw-clock is-small">
        <Dial zone="local" now={now} big />
      </div>
    );
  }
  if (size === "medium") {
    return (
      <div className="dw-clock is-world">
        {zones.map((z) => (
          <div key={z} className="dw-city">
            <Dial zone={z} now={now} />
            <span className="dw-city-name">{cityOf(z)}</span>
            <span className="dw-sub">{offsetLabel(now, z)}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="dw-clock is-large">
      <Dial zone="local" now={now} big />
      <ul className="dw-list">
        {zones
          .filter((z) => z !== "local")
          .map((z) => (
            <li key={z}>
              <span>{cityOf(z)}</span>
              <span className="dw-num">{hhmm(timeIn(now, z))}</span>
            </li>
          ))}
      </ul>
    </div>
  );
};

// ---- Calendar -----------------------------------------------------------------------------------

/** "10:09" and "AM" apart (no day period on a 24-hour PC). */
function timeParts(now: Date): { time: string; period: string } {
  const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(now);
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return { time, period };
}

const MonthGrid: React.FC<{ now: Date }> = ({ now }) => {
  const first = useMemo(() => weekStart(), []);
  const letters = useMemo(() => weekdayLetters(first), [first]);
  const weeks = monthGrid(now.getFullYear(), now.getMonth(), first);
  const today = now.getDate();
  return (
    <div className="dwk-month" role="grid" aria-label={now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}>
      <span className="dwk-month-name">{now.toLocaleDateString(undefined, { month: "long" })}</span>
      <div className="dwk-row is-head" role="row">
        {letters.map((l, i) => (
          <span key={i} role="columnheader">
            {l}
          </span>
        ))}
      </div>
      {weeks.map((w, i) => (
        <div key={i} className="dwk-row" role="row">
          {w.map((d, j) => (
            <span key={j} role="gridcell" className={d === today ? "is-today" : undefined} aria-current={d === today ? "date" : undefined}>
              {d ?? ""}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

/** Clock, date and this month: the widget the flyout puts top-left. */
export const CalendarWidget: React.FC<WidgetProps> = ({ size, preview }) => {
  const live = useTick("minute");
  const now = preview ? new Date(2026, 0, 15, 10, 9, 30) : live;
  const { time, period } = timeParts(now);
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const date = now.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const [events] = useState<CalEvent[]>(() => (preview ? sampleToday(now) : readCalendar(safeGet(CALENDAR_KEY))));
  const face = (
    <div className="dwk-face">
      <span className="dwk-weekday">{weekday}</span>
      <span className="dwk-time dw-num">
        {time}
        {period && <span className="dwk-period">{period}</span>}
      </span>
      <span className="dw-sub">{date}</span>
    </div>
  );
  if (size === "small") {
    return (
      <div className="dw-calendar is-small" aria-label={`${weekday}, ${date}, ${time} ${period}`.trim()}>
        <span className="dwk-weekday">{now.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <span className="dwk-day dw-num">{now.getDate()}</span>
        <span className="dw-sub dw-num">
          {time} {period}
        </span>
      </div>
    );
  }
  if (size === "medium") {
    return (
      <div className="dw-calendar is-medium">
        {face}
        <MonthGrid now={now} />
      </div>
    );
  }
  const open = todayOpen(events, now).slice(0, 4);
  return (
    <div className="dw-calendar is-large">
      <div className="dwk-top">
        {face}
        <MonthGrid now={now} />
      </div>
      <div className="dwk-agenda">
        <span className="dw-head">Today</span>
        {open.length === 0 ? (
          <span className="dw-sub">Nothing left today.</span>
        ) : (
          <ul className="dw-list">
            {open.map((e) => (
              <li key={e.id}>
                <span className="dw-clip">{e.title}</span>
                {e.time && <span className="dw-num dw-sub">{e.time}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---- Weather ------------------------------------------------------------------------------------

const SAMPLE_WEATHER: WeatherNow = { temp: 21, code: 2, hi: 26, lo: 15, wind: 9, unit: "°C" };

function useApproved(store: WidgetStore | null | undefined, ref: string | undefined, galleryId?: string): WidgetInstance | null {
  return useMemo(() => {
    const list = store?.widgets ?? [];
    return list.find((w) => w.id === ref) ?? (galleryId ? list.find((w) => w.galleryId === galleryId) : undefined) ?? null;
  }, [store, ref, galleryId]);
}

export const WeatherWidget: React.FC<WidgetProps> = ({ size, params, preview, store }) => {
  const inst = useApproved(store, params.ref, "weather");
  const [w, setW] = useState<WeatherNow | null>(preview ? SAMPLE_WEATHER : null);
  const [note, setNote] = useState<string | null>(null);
  const def = galleryDef("weather");
  const url = inst && def ? def.url(inst.params) : null;
  useEvery(
    15 * 60,
    () => {
      if (!inst || !url || store?.fetchOff) return;
      widgetsApi
        .fetch(inst.id, url, def?.refreshMinutes ?? 30)
        .then((f) => {
          const v = weatherFrom(f.body, inst.params.units);
          setW(v);
          setNote(v ? null : "No weather for that place right now.");
        })
        .catch((e) => setNote(typeof e === "string" ? e : "The weather site couldn't be reached."));
    },
    !preview && !!inst && !!url,
  );
  const place = preview ? "Sample City" : inst?.params.place || "Weather";
  if (!preview && !inst) return <p className="dw-empty">Add Weather on the Dashboard first. It asks before Lens fetches anything.</p>;
  if (!preview && store?.fetchOff) return <p className="dw-empty">Widget fetching is turned off (Dashboard › Widgets › Sources).</p>;
  if (!w) return <p className="dw-empty">{note ?? "Loading…"}</p>;
  const round = (n: number | null) => (n === null ? "–" : `${Math.round(n)}°`);
  return (
    <div className={`dw-weather is-${size}`}>
      <span className="dw-title">{place}</span>
      <span className="dw-big dw-num">{Math.round(w.temp)}°</span>
      <span className="dw-sub">{weatherWords(w.code)}</span>
      <span className="dw-sub dw-num">
        H:{round(w.hi)} L:{round(w.lo)}
      </span>
      {size !== "small" && w.wind !== null && <span className="dw-sub dw-num">Wind {Math.round(w.wind)} {w.unit === "°F" ? "mph" : "km/h"}</span>}
      {size === "large" && <span className="dw-fine">Open-Meteo, CC BY 4.0. Lens fetches it from the site you approved.</span>}
    </div>
  );
};

// ---- Batteries ----------------------------------------------------------------------------------

const SAMPLE_BATTERY = { hasBattery: true, percent: 76, charging: true, pluggedIn: true, secondsLeft: null, batterySaver: false, powerMode: "balanced", powerModeSupported: true } as BatteryStatus;

const Ring: React.FC<{ percent: number | null; charging: boolean; big?: boolean }> = ({ percent, charging, big }) => (
  <div className={`dwb-ring${big ? " is-big" : ""}${percent !== null && percent <= 20 && !charging ? " is-low" : ""}`}>
    <svg viewBox="0 0 48 48" aria-hidden>
      <circle className="dwb-track" cx="24" cy="24" r="20" />
      <circle className="dwb-fill" cx="24" cy="24" r="20" strokeDasharray={ringDash(percent, 20)} transform="rotate(-90 24 24)" />
    </svg>
    <span className="dwb-icon">{charging ? <BatteryCharging size={big ? 18 : 14} aria-hidden /> : <Plug size={big ? 16 : 12} aria-hidden />}</span>
  </div>
);

export const BatteriesWidget: React.FC<WidgetProps> = ({ size, preview }) => {
  const [b, setB] = useState<BatteryStatus | null>(preview ? SAMPLE_BATTERY : null);
  useEvery(60, () => void invoke<BatteryStatus>("get_battery_cmd").then(setB).catch(quiet), !preview);
  if (!b) return <p className="dw-empty">Reading the battery…</p>;
  if (!b.hasBattery) return <p className="dw-empty">This PC has no battery: it runs on mains power.</p>;
  const pct = b.percent ?? null;
  const label = pct === null ? "–" : `${pct}%`;
  const state = b.charging ? "Charging" : b.pluggedIn ? "Plugged in" : timeLeft(b.secondsLeft) ?? "On battery";
  if (size === "small") {
    return (
      <div className="dw-battery is-small" aria-label={`This PC ${label}, ${state}`}>
        <Ring percent={pct} charging={b.charging} big />
        <span className="dw-num dw-mid">{label}</span>
      </div>
    );
  }
  if (size === "medium") {
    return (
      <div className="dw-battery is-medium">
        <Ring percent={pct} charging={b.charging} big />
        <div className="dw-col">
          <span className="dw-title">This PC</span>
          <span className="dw-big dw-num">{label}</span>
          <span className="dw-sub">{state}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="dw-battery is-large">
      <span className="dw-title">Batteries</span>
      <ul className="dw-bars">
        <li>
          <span className="dw-bar-label">This PC</span>
          <span className="dw-bar">
            <span className="dw-bar-fill" style={fillStyle((pct ?? 0) / 100)} />
          </span>
          <span className="dw-num">{label}</span>
        </li>
      </ul>
      <span className="dw-sub">{state}{b.batterySaver ? " · Battery saver on" : ""}</span>
      <span className="dw-fine">Bluetooth device batteries aren't shown yet.</span>
    </div>
  );
};

// ---- Now playing --------------------------------------------------------------------------------

const SAMPLE_MEDIA = { hasSession: true, isPlaying: true, title: "Sample Song", artist: "Sample Artist", album: "", sourceApp: "Spotify", thumbnailDataUrl: null, positionMs: 64_000, durationMs: 214_000, updatedMs: 0, canSeek: false } as MediaNowPlaying;

export const MusicWidget: React.FC<WidgetProps> = ({ size, preview }) => {
  const [m, setM] = useState<MediaNowPlaying | null>(preview ? SAMPLE_MEDIA : null);
  const playing = !!m?.isPlaying;
  // Every 2 s while playing, every 6 s otherwise, on the shared tick (art is cached in Rust).
  const refresh = useCallback(() => void invoke<MediaNowPlaying>("get_media_now_playing_cmd").then((v) => setM(v && v.hasSession ? v : null)).catch(quiet), []);
  useEvery(playing ? 2 : 6, refresh, !preview);
  const act = (action: "play_pause" | "next" | "prev") => {
    if (preview) return;
    void invoke("media_control_cmd", { action }).catch(quiet);
    if (action === "play_pause" && m) setM({ ...m, isPlaying: !m.isPlaying });
    window.setTimeout(refresh, 400);
  };
  const now = useTick("second");
  const pos = m && m.durationMs > 0 ? Math.min(1, (m.positionMs + (playing && m.updatedMs ? Math.max(0, now.getTime() - m.updatedMs) : 0)) / m.durationMs) : 0;
  const art = m?.thumbnailDataUrl ? <img className="dwm-art" src={m.thumbnailDataUrl} alt="" /> : <span className="dwm-art is-empty" aria-hidden><Music size={size === "small" ? 22 : 18} /></span>;
  const controls = (
    <div className="dwm-controls">
      {size !== "small" && (
        <button type="button" data-weight="medium" aria-label="Previous" onClick={() => act("prev")}>
          <SkipBack size={14} aria-hidden />
        </button>
      )}
      <button type="button" data-weight="medium" className="is-main" aria-label={playing ? "Pause" : "Play"} onClick={() => act("play_pause")}>
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>
      {size !== "small" && (
        <button type="button" data-weight="medium" aria-label="Next" onClick={() => act("next")}>
          <SkipForward size={14} aria-hidden />
        </button>
      )}
    </div>
  );
  if (!m) {
    return (
      <div className={`dw-music is-${size} is-idle`}>
        {art}
        <span className="dw-sub">Nothing playing</span>
      </div>
    );
  }
  return (
    <div className={`dw-music is-${size}`}>
      {art}
      <div className="dw-col">
        <span className="dw-title dw-clip">{m.title}</span>
        <span className="dw-sub dw-clip">{m.artist || m.sourceApp}</span>
      </div>
      {size === "large" && m.durationMs > 0 && (
        <span className="dw-bar" aria-hidden>
          <span className="dw-bar-fill" style={fillStyle(pos)} />
        </span>
      )}
      {controls}
    </div>
  );
};

// ---- Notes --------------------------------------------------------------------------------------

interface NoteRow {
  id: string;
  title: string;
  text: string;
  updated: number;
}

const SAMPLE_NOTES: NoteRow[] = [
  { id: "n1", title: "Sample: Groceries", text: "Oat milk, lemons, coffee", updated: 3 },
  { id: "n2", title: "Sample: Design review", text: "Bring the new Dock sketches", updated: 2 },
  { id: "n3", title: "Sample: Ideas", text: "Desktop widgets that snap", updated: 1 },
];

const firstLine = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/^#+\s*|^[-*]\s+(\[.\]\s*)?/, "").trim()).find(Boolean) ?? "";

export const NotesWidget: React.FC<WidgetProps> = ({ size, preview }) => {
  const [notes, setNotes] = useState<NoteRow[] | null>(preview ? SAMPLE_NOTES : null);
  const load = useCallback(async () => {
    try {
      const shelves = await invoke<ShelfInfo[]>("shelves_list");
      const notesShelf = (shelves ?? []).find((s) => s.name === NOTES_SHELF_NAME);
      if (!notesShelf) return setNotes([]);
      const items = await invoke<ShelfItem[]>("shelf_list", { shelf: notesShelf.id });
      setNotes(
        (items ?? [])
          .filter((i) => i.kind === "text")
          .sort((a, b) => b.updated_ms - a.updated_ms)
          .map((i) => ({ id: i.id, title: i.title || firstLine(i.text) || "Untitled", text: i.text, updated: i.updated_ms })),
      );
    } catch {
      setNotes([]);
    }
  }, []);
  useEvery(5 * 60, () => void load(), !preview);
  useEffect(() => {
    if (preview) return;
    let un: (() => void) | undefined;
    let alive = true;
    listen(EVT_SHELF_CHANGED, () => void load()).then((u) => (alive ? (un = u) : u())).catch(quiet);
    return () => {
      alive = false;
      un?.();
    };
  }, [preview, load]);
  const open = (n?: NoteRow) => {
    if (preview) return;
    void invoke("coreapp_open", { id: "notes", view: null, find: n?.title ?? null }).catch(quiet);
  };
  if (!notes) return <p className="dw-empty">Reading your notes…</p>;
  if (!notes.length) {
    return (
      <div className="dw-notes is-empty">
        <StickyNote size={18} aria-hidden />
        <span className="dw-sub">No notes yet</span>
        <button type="button" data-weight="medium" className="dw-link" onClick={() => open()}>
          Open Lens Notes
        </button>
      </div>
    );
  }
  const shown = notes.slice(0, size === "small" ? 1 : size === "medium" ? 2 : 6);
  return (
    <div className={`dw-notes is-${size}`}>
      <span className="dw-head">
        <StickyNote size={13} aria-hidden /> Notes
      </span>
      <ul className="dw-note-list">
        {shown.map((n) => (
          <li key={n.id}>
            <button type="button" data-weight="light" className="dw-note" onClick={() => open(n)}>
              <span className="dw-title dw-clip">{n.title}</span>
              {size !== "large" || shown.length < 4 ? <span className="dw-sub dw-clamp">{firstLine(n.text.replace(n.title, "")) || " "}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---- Today --------------------------------------------------------------------------------------

function sampleToday(now: Date): CalEvent[] {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return [
    { id: "s1", dateKey: key, time: "09:30", title: "Sample: Stand-up", done: false },
    { id: "s2", dateKey: key, time: "13:00", title: "Sample: Design review", done: false },
    { id: "s3", dateKey: key, time: "", title: "Sample: Water the plants", done: false },
  ];
}

export const TodayWidget: React.FC<WidgetProps> = ({ size, preview }) => {
  const now = useTick("minute");
  const [events, setEvents] = useState<CalEvent[]>(() => (preview ? sampleToday(new Date()) : readCalendar(safeGet(CALENDAR_KEY))));
  const listRef = useRef<HTMLUListElement>(null);
  // The calendar is shared by every Lens window: follow changes made elsewhere.
  useEffect(() => {
    if (preview) return;
    const on = (e: StorageEvent) => e.key === CALENDAR_KEY && setEvents(readCalendar(e.newValue));
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [preview]);
  useEvery(60, () => !preview && setEvents(readCalendar(safeGet(CALENDAR_KEY))), !preview);
  const open = todayOpen(events, now);
  const tick = async (id: string) => {
    const li = listRef.current?.querySelector(`[data-event="${CSS.escape(id)}"]`);
    // It animates away (transform and opacity), then the list and the count update.
    await glide(li, { opacity: 1, x: 0 }, { opacity: 0, x: 24 }, { duration: "base", ease: "exit", hold: true }).finished;
    const next = tickOff(events, id);
    setEvents(next);
    if (!preview) {
      try {
        localStorage.setItem(CALENDAR_KEY, JSON.stringify(next));
      } catch {
        /* storage full or off: the tick stays on this screen only */
      }
    }
  };
  const max = size === "small" ? 2 : size === "medium" ? 3 : 8;
  return (
    <div className={`dw-today is-${size}`}>
      <span className="dw-head">
        <span>Today</span>
        <span className="dw-count dw-num" aria-label={`${open.length} left today`}>
          {open.length}
        </span>
      </span>
      {open.length === 0 ? (
        <p className="dw-sub">Nothing left today.</p>
      ) : (
        <ul className="dw-tasks" ref={listRef}>
          {open.slice(0, max).map((e) => (
            <li key={e.id} data-event={e.id}>
              <button type="button" data-weight="medium" className="dw-check" aria-label={`Done: ${e.title}`} onClick={() => void tick(e.id)}>
                <Check size={11} aria-hidden />
              </button>
              <span className="dw-clip">{e.title}</span>
              {e.time && size !== "small" && <span className="dw-sub dw-num">{e.time}</span>}
            </li>
          ))}
        </ul>
      )}
      {open.length > max && <span className="dw-fine">+{open.length - max} more</span>}
    </div>
  );
};

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ---- Dashboard gallery widgets ------------------------------------------------------------------

export const GalleryWidget: React.FC<WidgetProps> = ({ params, preview, store }) => {
  const inst = useApproved(store, params.ref);
  const [tick, setTick] = useState(0);
  useEvery(10 * 60, () => setTick((n) => n + 1), !preview && !!inst);
  const def = inst ? galleryDef(inst.galleryId) : undefined;
  const sample: WidgetInstance = { id: "sample", galleryId: "clocks", title: "World clocks", params: { zones: "UTC,Europe/London,Asia/Tokyo" }, hosts: [], addedMs: 0 };
  const card = useWidgetCard(inst ?? sample, inst ? def : galleryDef("clocks"), widgetsApi, !!store?.fetchOff, tick);
  if (!preview && !inst) return <p className="dw-empty">This Dashboard widget was removed. Remove it here too?</p>;
  return (
    <div className="dw-gallery">
      <span className="dw-head">{inst?.title ?? "World clocks"}</span>
      {card.loading ? <p className="dw-sub">Loading…</p> : card.note ? <p className="dw-sub">{card.note}</p> : <AdaptiveCard body={card.body} onOpenUrl={preview ? undefined : (u) => void widgetsApi.openUrl(u)} />}
    </div>
  );
};

export const WIDGETS: Record<string, React.FC<WidgetProps>> = {
  calendar: CalendarWidget,
  clock: ClockWidget,
  weather: WeatherWidget,
  batteries: BatteriesWidget,
  music: MusicWidget,
  notes: NotesWidget,
  today: TodayWidget,
  gallery: GalleryWidget,
};
