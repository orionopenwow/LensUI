import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  Bell,
  BellOff,
  Play,
  Pause,
  RotateCcw,
  Download,
  Globe,
} from "lucide-react";
import {
  DAY_NAMES,
  WEEK_START_KEY,
  leadingBlanks,
  resolveWeekStart,
  weekdayLabels,
  type WeekStartPref,
} from "../utils/productivity";

interface CalEvent {
  id: string;
  dateKey: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  done: boolean;
  notified?: boolean;
}

const STORAGE_KEY = "lens_calendar_events_v1";
const WEEK_PREFS: WeekStartPref[] = ["auto", "1", "0", "6"];

function readWeekPref(): WeekStartPref {
  try {
    const v = localStorage.getItem(WEEK_START_KEY);
    return v === "0" || v === "1" || v === "6" ? v : "auto";
  } catch {
    return "auto";
  }
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const CalendarClockPane: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(new Date()));
  const [events, setEvents] = useState<CalEvent[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [weekPref, setWeekPref] = useState<WeekStartPref>(readWeekPref);
  const weekStart = resolveWeekStart(weekPref, typeof navigator !== "undefined" ? navigator.language : "en-US");
  const cycleWeekStart = () => {
    const next = WEEK_PREFS[(WEEK_PREFS.indexOf(weekPref) + 1) % WEEK_PREFS.length];
    setWeekPref(next);
    try {
      if (next === "auto") localStorage.removeItem(WEEK_START_KEY);
      else localStorage.setItem(WEEK_START_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts until the pane closes */
    }
  };
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTime, setDraftTime] = useState("16:00");
  const [dnd, setDnd] = useState(() => localStorage.getItem("lens_dnd") === "1");

  // Focus Timer (Pomodoro)
  const [timerPresetMin, setTimerPresetMin] = useState(25);
  const [timerRemainingSec, setTimerRemainingSec] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
      // ignore
    }
  }, [events]);

  // Focus timer countdown
  useEffect(() => {
    if (!timerRunning) return;
    const t = window.setInterval(() => {
      setTimerRemainingSec((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          invoke("push_notification_cmd", {
            title: "Focus Session Complete",
            body: `Your ${timerPresetMin}-minute focus timer finished. Take a quick break!`,
            appName: "Lens Timer",
            category: "timer",
          }).catch(() => {});
          return timerPresetMin * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [timerRunning, timerPresetMin]);

  // Trigger real Lens notifications when a scheduled reminder hits the current minute
  useEffect(() => {
    const todayKey = toDateKey(now);
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    let changed = false;
    const next = events.map((ev) => {
      if (!ev.done && !ev.notified && ev.dateKey === todayKey && ev.time === hhmm) {
        changed = true;
        invoke("push_notification_cmd", {
          title: ev.title,
          body: `Scheduled reminder for ${ev.time}`,
          appName: "Lens Calendar",
          category: "calendar",
        }).catch(() => {});
        return { ...ev, notified: true };
      }
      return ev;
    });
    if (changed) setEvents(next);
  }, [now.getMinutes()]);

  // Analog Circle Clock angles
  const secs = now.getSeconds();
  const mins = now.getMinutes() + secs / 60;
  const hrs = (now.getHours() % 12) + mins / 60;
  const secAngle = secs * 6;
  const minAngle = mins * 6;
  const hourAngle = hrs * 30;

  // Monthly calendar cells
  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < leadingBlanks(firstDow, weekStart); i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [viewMonth, weekStart]);

  const todayKey = toDateKey(now);
  const eventDates = useMemo(() => new Set(events.map((e) => e.dateKey)), [events]);
  const selectedEvents = useMemo(
    () => events.filter((e) => e.dateKey === selectedKey).sort((a, b) => a.time.localeCompare(b.time)),
    [events, selectedKey]
  );

  const addEvent = () => {
    const title = draftTitle.trim();
    if (!title) return;
    setEvents((prev) => [
      ...prev,
      { id: `ev-${Date.now()}`, dateKey: selectedKey, time: draftTime, title, done: false },
    ]);
    setDraftTitle("");
  };

  const exportIcs = () => {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lens UI//Calendar//EN"];
    for (const ev of events) {
      const dt = ev.dateKey.replace(/-/g, "") + "T" + ev.time.replace(":", "") + "00";
      lines.push("BEGIN:VEVENT", `UID:${ev.id}@lensui`, `DTSTART:${dt}`, `SUMMARY:${ev.title}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lens-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const worldClocks = [
    { city: "NYC", tz: "America/New_York" },
    { city: "LON", tz: "Europe/London" },
    { city: "TYO", tz: "Asia/Tokyo" },
    { city: "UTC", tz: "UTC" },
  ];

  const timerMM = String(Math.floor(timerRemainingSec / 60)).padStart(2, "0");
  const timerSS = String(timerRemainingSec % 60).padStart(2, "0");

  return (
    <div className="qs-pane" style={{ ["--qs-slide-from" as string]: "10px" }}>
      {/* Analog Circle Clock + Live Digital Readout */}
      <div
        className="qs-card"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: "12px 14px",
        }}
      >
        <svg width="86" height="86" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
          <defs>
            <radialGradient id="lensClockFace" cx="50%" cy="35%" r="65%">
              <stop offset="0%" stopColor="var(--lens-clock-face-a, #23242b)" />
              <stop offset="100%" stopColor="var(--lens-clock-face-b, #0b0b0e)" />
            </radialGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="url(#lensClockFace)"
            stroke="rgb(var(--lens-ink) / 0.18)"
            strokeWidth="1.8"
          />
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i * 30 * Math.PI) / 180;
            const inner = i % 3 === 0 ? 36 : 39;
            return (
              <line
                key={i}
                x1={50 + Math.sin(ang) * inner}
                y1={50 - Math.cos(ang) * inner}
                x2={50 + Math.sin(ang) * 43}
                y2={50 - Math.cos(ang) * 43}
                stroke={i % 3 === 0 ? "var(--lens-fg)" : "rgb(var(--lens-ink) / 0.35)"}
                strokeWidth={i % 3 === 0 ? 2.2 : 1.2}
                strokeLinecap="round"
              />
            );
          })}
          {/* Hour Hand */}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="25"
            stroke="var(--lens-fg)"
            strokeWidth="3.2"
            strokeLinecap="round"
            transform={`rotate(${hourAngle} 50 50)`}
          />
          {/* Minute Hand */}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="16"
            stroke="var(--lens-fg-2, #e4e4e7)"
            strokeWidth="2.2"
            strokeLinecap="round"
            transform={`rotate(${minAngle} 50 50)`}
          />
          {/* Sweeping Second Hand */}
          <line
            x1="50"
            y1="57"
            x2="50"
            y2="14"
            stroke="#FB7185"
            strokeWidth="1.2"
            strokeLinecap="round"
            transform={`rotate(${secAngle} 50 50)`}
          />
          <circle cx="50" cy="50" r="3.2" fill="var(--lens-fg)" />
          <circle cx="50" cy="50" r="1.4" fill="#FB7185" />
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--lens-fg)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--lens-fg-secondary)" }}>
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)" }}>
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </div>
        </div>
      </div>

      {/* Interactive Monthly Calendar */}
      <div className="qs-card" style={{ gap: 8 }}>
        <div className="qs-row">
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--lens-fg)" }}>
            {viewMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="qs-seg-btn"
              style={{ flex: "none", padding: "3px 8px", fontSize: 10.5, whiteSpace: "nowrap" }}
              aria-label={`Week starts on ${DAY_NAMES[weekStart]}${weekPref === "auto" ? " (from your region)" : ""}. Click to change.`}
              onClick={cycleWeekStart}
            >
              {weekPref === "auto" ? "Auto · " : ""}
              {DAY_NAMES[weekStart].slice(0, 3)}
            </button>
            <button
              type="button"
              className="qs-seg-btn"
              style={{ flex: "none", padding: "3px 8px", fontSize: 10.5 }}
              onClick={() => {
                const t = new Date();
                setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1));
                setSelectedKey(toDateKey(t));
              }}
            >
              Today
            </button>
            <button aria-label="Previous month"
              type="button"
              style={{ color: "var(--lens-fg)", padding: 4, borderRadius: 6, cursor: "pointer" }}
              onClick={() =>
                setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={14} />
            </button>
            <button aria-label="Next month"
              type="button"
              style={{ color: "var(--lens-fg)", padding: 4, borderRadius: 6, cursor: "pointer" }}
              onClick={() =>
                setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 2,
            textAlign: "center",
          }}
        >
          {weekdayLabels(weekStart).map((d) => (
            <div key={d} style={{ fontSize: 10, fontWeight: 600, color: "var(--lens-fg-muted)", padding: "2px 0" }}>
              {d}
            </div>
          ))}
          {calendarCells.map((cell, idx) => {
            if (!cell) return <div key={`e-${idx}`} />;
            const key = toDateKey(cell);
            const isToday = key === todayKey;
            const isSel = key === selectedKey;
            const hasEv = eventDates.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                style={{
                  height: 28,
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: isToday || isSel ? 700 : 500,
                  background: isToday
                    ? "var(--lens-fg)"
                    : isSel
                      ? "rgb(var(--lens-ink) / 0.14)"
                      : "transparent",
                  color: isToday ? "var(--lens-on-fg)" : "var(--lens-fg)",
                  border: isSel && !isToday ? "1px solid rgb(var(--lens-ink) / 0.28)" : "1px solid transparent",
                  position: "relative",
                  cursor: "pointer",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {cell.getDate()}
                {hasEv && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 2,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: isToday ? "var(--lens-on-fg)" : "#FBBF24",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Synced Agenda & Reminders */}
      <div className="qs-card" style={{ gap: 8 }}>
        <div className="qs-row">
          <span className="qs-row-title">Agenda · {selectedKey === todayKey ? "Today" : selectedKey}</span>
          <button
            type="button"
            onClick={exportIcs}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--lens-fg-secondary)",
              cursor: "pointer",
            }}
          >
            <Download size={12} />
            <span>Export .ics</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="time"
            value={draftTime}
            onChange={(e) => setDraftTime(e.target.value)}
            style={{
              width: 82,
              background: "var(--lens-pack-base, #0d0d10)",
              border: "1px solid rgb(var(--lens-ink) / 0.12)",
              borderRadius: 7,
              padding: "5px 6px",
              fontSize: 11,
              color: "var(--lens-fg)",
            }}
          />
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addEvent();
            }}
            placeholder="Add reminder or event..."
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--lens-pack-base, #0d0d10)",
              border: "1px solid rgb(var(--lens-ink) / 0.12)",
              borderRadius: 7,
              padding: "5px 8px",
              fontSize: 11.5,
              color: "var(--lens-fg)",
              outline: "none",
            }}
          />
          <button aria-label="Add event"
            type="button"
            onClick={addEvent}
            style={{
              padding: "0 9px",
              borderRadius: 7,
              background: "var(--lens-fg)",
              color: "var(--lens-on-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Plus size={14} strokeWidth={2.6} />
          </button>
        </div>

        {selectedEvents.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--lens-fg-muted)" }}>
            No events scheduled for this date.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {selectedEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgb(var(--lens-ink) / 0.04)",
                }}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!ev.done}
                  aria-label={`Done: ${ev.title}`}
                  onClick={() =>
                    setEvents((prev) =>
                      prev.map((x) => (x.id === ev.id ? { ...x, done: !x.done } : x))
                    )
                  }
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    border: "1px solid rgb(var(--lens-ink) / 0.28)",
                    background: ev.done ? "#34D399" : "transparent",
                    color: "var(--lens-on-fg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {ev.done && <Check size={11} strokeWidth={3} />}
                </button>
                <span style={{ fontSize: 11, color: "#FBBF24", fontVariantNumeric: "tabular-nums" }}>
                  {ev.time}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: ev.done ? "var(--lens-fg-muted)" : "#fafafa",
                    textDecoration: ev.done ? "line-through" : "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ev.title}
                </span>
                <button aria-label="Delete event"
                  type="button"
                  onClick={() => setEvents((prev) => prev.filter((x) => x.id !== ev.id))}
                  style={{ color: "var(--lens-fg-muted)", cursor: "pointer" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Focus Timer + World Clocks + Notification Controls */}
      <div className="qs-card" style={{ gap: 9 }}>
        <div className="qs-row">
          <div>
            <div className="qs-row-title">Focus Timer</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#34D399", fontVariantNumeric: "tabular-nums" }}>
              {timerMM}:{timerSS}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {[15, 25, 45].map((m) => (
              <button
                key={m}
                type="button"
                className={`qs-seg-btn ${timerPresetMin === m ? "active" : ""}`}
                style={{ flex: "none", padding: "4px 7px", fontSize: 10.5 }}
                onClick={() => {
                  setTimerRunning(false);
                  setTimerPresetMin(m);
                  setTimerRemainingSec(m * 60);
                }}
              >
                {m}m
              </button>
            ))}
            <button aria-label={timerRunning ? "Pause timer" : "Start timer"}
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              style={{
                width: 28,
                height: 26,
                borderRadius: 7,
                background: "var(--lens-fg)",
                color: "var(--lens-on-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {timerRunning ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button aria-label="Reset timer"
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setTimerRemainingSec(timerPresetMin * 60);
              }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "rgb(var(--lens-ink) / 0.08)",
                color: "var(--lens-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--lens-border)" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          {worldClocks.map((wc) => (
            <div
              key={wc.city}
              style={{
                padding: "5px 6px",
                borderRadius: 8,
                background: "rgb(var(--lens-ink) / 0.035)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 9.5, color: "var(--lens-fg-muted)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                <Globe size={9} />
                {wc.city}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--lens-fg)", fontVariantNumeric: "tabular-nums" }}>
                {now.toLocaleTimeString([], { timeZone: wc.tz, hour: "2-digit", minute: "2-digit", hour12: false })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="qs-seg-btn"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 8px" }}
            onClick={() => {
              const next = !dnd;
              setDnd(next);
              localStorage.setItem("lens_dnd", next ? "1" : "0");
            }}
          >
            {dnd ? <BellOff size={13} color="#FB7185" /> : <Bell size={13} color="#60A5FA" />}
            <span>{dnd ? "DND Active" : "Notifications On"}</span>
          </button>
          <button
            type="button"
            className="qs-seg-btn active"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 8px" }}
            onClick={() =>
              invoke("push_notification_cmd", {
                title: "Lens Notifications Ready",
                body: "Calendar reminders, focus timers, and Windows alerts appear cleanly here.",
                appName: "Lens",
                category: "calendar",
              })
            }
          >
            <Bell size={13} />
            <span>Test Pop-Up</span>
          </button>
        </div>
      </div>
    </div>
  );
};
