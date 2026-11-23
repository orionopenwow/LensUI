// Lens Timer: timers, pomodoro (with Lens Do Not Disturb during focus), a stopwatch and alarms.
// Timers, pomodoro and alarms run in Lens itself, so they ring with this window closed, show a
// countdown on the Dock pin and send a notification. Voice "start a 10 minute timer" lands here.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LensConfig, PomodoroConfig, TimerItem } from "../../types/generated";
import { DotText } from "../../themes/dotmatrix/DotMatrix";
import { AppShell, isKey } from "../shell/AppShell";
import { Button, Card, Empty, ErrorNote, Pill, Switch, Tabs, Toast, cx } from "../shell/ui";
import { useLoad, useShape, useStored, useVisible } from "../shell/hooks";
import { clock, countdown } from "../shell/format";
import { DAYS, PRESETS, STOPWATCH0, describeDays, elapsed, parseTime, progress, remainingOf, splits, stopwatch, toggleDay, tzOffsetMin, type Stopwatch } from "../models/timer";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

type View = "timers" | "pomodoro" | "stopwatch" | "alarms";
type Face = "classic" | "dots" | "expressive";

/** Re-renders every `ms` while visible (the countdown display); nothing runs while hidden. */
function useNow(ms: number, on: boolean, fixed?: number): number {
  const [now, setNow] = useState(fixed ?? Date.now());
  const visible = useVisible();
  useEffect(() => {
    if (fixed != null || !visible || !on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms, on, visible, fixed]);
  return fixed ?? now;
}

/** The big clock face: classic numerals, LED dots, or an Expressive ring. */
const BigClock: React.FC<{ text: string; face: Face; frac?: number; label: string; sub?: string }> = ({ text, face, frac = 0, label, sub }) => {
  if (face === "dots")
    return (
      <div className="tm-face tm-dots" role="timer" aria-label={label}>
        <DotText text={text} pitch={15} ghost label={label} />
        {sub && <div className="tm-face-sub">{sub}</div>}
      </div>
    );
  if (face === "expressive") {
    const r = 92;
    const c = 2 * Math.PI * r;
    return (
      <div className="tm-face tm-ring" role="timer" aria-label={label}>
        <svg viewBox="0 0 220 220" aria-hidden>
          <circle cx="110" cy="110" r={r} className="tm-ring-track" />
          <circle cx="110" cy="110" r={r} className="tm-ring-fill" strokeDasharray={c} strokeDashoffset={c * frac} transform="rotate(-90 110 110)" />
        </svg>
        <div className="tm-ring-text">
          <span>{text}</span>
          {sub && <small>{sub}</small>}
        </div>
      </div>
    );
  }
  return (
    <div className="tm-face" role="timer" aria-label={label}>
      <span className="tm-digits">{text}</span>
      {sub && <div className="tm-face-sub">{sub}</div>}
    </div>
  );
};

export interface TimerDemo {
  items: TimerItem[];
  now: number;
  stopwatch?: Stopwatch;
  face?: Face;
}

export const Timer: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; initialView?: string; demo?: TimerDemo }> = ({ config, updateConfig, initialView, demo }) => {
  const app = coreApp("timer")!;
  const shape = useShape();
  const [view, setView] = useState<View>((["timers", "pomodoro", "stopwatch", "alarms"] as View[]).includes(initialView as View) ? (initialView as View) : "timers");
  const [storedFace, setFace] = useStored<Face | "auto">("timer.face", "auto");
  const face: Face = demo?.face ?? (storedFace === "auto" ? (shape === "dotmatrix" ? "dots" : shape === "expressive" ? "expressive" : "classic") : storedFace);
  const load = useLoad<TimerItem[]>("coreapp_timers", {}, { enabled: !demo });
  const [items, setItems] = useState<TimerItem[]>(demo?.items ?? []);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [sw, setSw] = useStored<Stopwatch>("timer.stopwatch", STOPWATCH0);
  const swState = demo?.stopwatch ?? sw;
  const [len, setLen] = useState("");
  const [label, setLabel] = useState("");
  const [alarmAt, setAlarmAt] = useState("07:00");
  const [alarmLabel, setAlarmLabel] = useState("");
  const [alarmDays, setAlarmDays] = useState(0);
  const [pomo, setPomo] = useStored<PomodoroConfig>("timer.pomodoro", { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4, dnd: true });
  const lenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (load.data) setItems(load.data);
  }, [load.data]);
  useEffect(() => {
    if (demo) return;
    const un = listen<TimerItem[]>("lens://coreapp-timers", (e) => setItems(e.payload));
    const unView = listen<string>("lens://coreapp-view", (e) => setView(e.payload as View));
    return () => {
      un.then((f) => f()).catch(() => {});
      unView.then((f) => f()).catch(() => {});
    };
  }, [demo]);

  const running = items.some((t) => t.endsAtMs != null) || swState.running;
  const now = useNow(swState.running && view === "stopwatch" ? 100 : 250, running, demo?.now);
  const timers = items.filter((t) => t.kind === "timer");
  const pomodoro = items.find((t) => t.kind === "pomodoro") ?? null;
  const alarms = items.filter((t) => t.kind === "alarm");
  const soonest = useMemo(() => [...timers].filter((t) => !t.done).sort((a, b) => Number(a.paused) - Number(b.paused) || remainingOf(a, now) - remainingOf(b, now))[0], [timers, now]);

  const call = (cmd: string, args: Record<string, unknown>) =>
    invoke<TimerItem[]>(cmd, args)
      .then(setItems)
      .catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));

  const addTimer = (secs?: number) => {
    const text = len.trim();
    if (!secs && !text) return lenRef.current?.focus();
    call("coreapp_timer_add", { label: label.trim(), seconds: secs ?? (/^\d+$/.test(text) ? Number(text) * 60 : null), duration: secs ? null : text }).then(() => {
      setLen("");
      setLabel("");
    });
  };
  const act = (id: number, action: "pause" | "resume" | "restart" | "remove") => call("coreapp_timer_action", { id, action });
  const addAlarm = () => {
    const t = parseTime(alarmAt);
    if (!t) return setToast({ text: "Type a time like 7:30 or 7:30 pm.", tone: "bad" });
    call("coreapp_alarm_add", { label: alarmLabel.trim(), hour: t[0], minute: t[1], weekdays: alarmDays, tzOffsetMin: tzOffsetMin() }).then(() => setAlarmLabel(""));
  };

  const swNow = elapsed(swState, now);
  const keys = [
    { keys: "Ctrl+1", label: "Timers", match: (e: KeyboardEvent) => isKey(e, "1", { ctrl: true }), run: () => setView("timers") },
    { keys: "Ctrl+2", label: "Pomodoro", match: (e: KeyboardEvent) => isKey(e, "2", { ctrl: true }), run: () => setView("pomodoro") },
    { keys: "Ctrl+3", label: "Stopwatch", match: (e: KeyboardEvent) => isKey(e, "3", { ctrl: true }), run: () => setView("stopwatch") },
    { keys: "Ctrl+4", label: "Alarms", match: (e: KeyboardEvent) => isKey(e, "4", { ctrl: true }), run: () => setView("alarms") },
    { keys: "Ctrl+N", label: "New timer", match: (e: KeyboardEvent) => isKey(e, "n", { ctrl: true }), run: () => (setView("timers"), setTimeout(() => lenRef.current?.focus(), 0)) },
    {
      keys: "Space",
      label: "Stopwatch: start / stop",
      match: (e: KeyboardEvent) => view === "stopwatch" && e.key === " ",
      run: () => setSw((s) => stopwatch(s, { type: s.running ? "stop" : "start", now: Date.now() })),
    },
    { keys: "L", label: "Stopwatch: lap", match: (e: KeyboardEvent) => view === "stopwatch" && e.key.toLowerCase() === "l" && !e.ctrlKey, run: () => setSw((s) => stopwatch(s, { type: "lap", now: Date.now() })) },
    { keys: "R", label: "Stopwatch: reset", match: (e: KeyboardEvent) => view === "stopwatch" && e.key.toLowerCase() === "r" && !e.ctrlKey, run: () => setSw((s) => stopwatch(s, { type: "reset" })) },
  ];

  const toolbar = (
    <>
      <Tabs
        label="Timer views"
        value={view}
        onChange={setView}
        options={[
          { id: "timers", label: "Timers", count: timers.length || undefined },
          { id: "pomodoro", label: "Pomodoro" },
          { id: "stopwatch", label: "Stopwatch" },
          { id: "alarms", label: "Alarms", count: alarms.length || undefined },
        ]}
      />
      <div className="ca-spacer" />
      <Tabs
        label="Clock face"
        value={storedFace}
        onChange={setFace}
        options={[
          { id: "auto", label: "Auto" },
          { id: "classic", label: "Classic" },
          { id: "dots", label: "Dot matrix" },
          { id: "expressive", label: "Ring" },
        ]}
      />
    </>
  );

  const phaseName = (p: TimerItem) => (p.phase === "focus" ? "Focus" : p.phase === "longBreak" ? "Long break" : "Break");

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      toolbar={toolbar}
      keys={keys}
      meta={running ? "Keeps running with this window closed · countdown on the Dock pin" : "Timers and alarms ring even with this window closed"}
      actions={
        view === "timers" ? (
          <Button variant="primary" onClick={() => addTimer()} disabled={!len.trim()}>
            Start timer
          </Button>
        ) : view === "stopwatch" ? (
          <>
            <Button onClick={() => setSw((s) => stopwatch(s, swState.running ? { type: "lap", now: Date.now() } : { type: "reset" }))} disabled={!swState.running && swNow === 0}>
              {swState.running ? "Lap" : "Reset"}
            </Button>
            <Button variant="primary" onClick={() => setSw((s) => stopwatch(s, { type: s.running ? "stop" : "start", now: Date.now() }))}>
              {swState.running ? "Stop" : swNow ? "Resume" : "Start"}
            </Button>
          </>
        ) : view === "pomodoro" ? (
          pomodoro ? (
            <Button variant="danger" onClick={() => act(pomodoro.id, "remove")}>
              End session
            </Button>
          ) : (
            <Button variant="primary" onClick={() => call("coreapp_pomodoro_start", { config: pomo })}>
              Start focus
            </Button>
          )
        ) : (
          <Button variant="primary" onClick={addAlarm}>
            Add alarm
          </Button>
        )
      }
    >
      {load.status === "error" && !demo && <ErrorNote onRetry={load.reload}>{load.error}</ErrorNote>}

      {view === "timers" && (
        <>
          {soonest ? (
            <BigClock
              face={face}
              text={countdown(remainingOf(soonest, now))}
              frac={progress(soonest.durationMs, remainingOf(soonest, now))}
              label={`${soonest.label}: ${countdown(remainingOf(soonest, now))} left`}
              sub={soonest.paused ? `${soonest.label} · paused` : soonest.label}
            />
          ) : (
            <Empty title="No timers running" config={config}>
              Type a length below, pick a preset, or say “Lens, start a 10 minute timer”.
            </Empty>
          )}
          <Card title="New timer">
            <div className="ca-row" style={{ flexWrap: "wrap" }}>
              <input ref={lenRef} className="ca-input" style={{ maxWidth: 180 }} value={len} onChange={(e) => setLen(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTimer()} placeholder="10m, 1h 30m, 90s" aria-label="Timer length" />
              <input className="ca-input" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTimer()} placeholder="Label (optional)" aria-label="Timer label" />
            </div>
            <div className="ca-row" style={{ flexWrap: "wrap", marginTop: 12 }}>
              {PRESETS.map((p) => (
                <Button key={p.secs} small onClick={() => addTimer(p.secs)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </Card>
          {timers.length > 0 && (
            <Card title="Timers" meta={`${timers.length}`}>
              <ul className="ca-list">
                {timers.map((t) => {
                  const left = remainingOf(t, now);
                  return (
                    <li key={t.id} className={cx("ca-item", t.done && "tm-done")}>
                      <div className="ca-item-main">
                        <div className="ca-item-title">{t.label}</div>
                        <div className="tm-bar" aria-hidden>
                          <span style={{ width: `${progress(t.durationMs, left) * 100}%` }} />
                        </div>
                      </div>
                      <span className="tm-left" aria-label={t.done ? `${t.label} finished` : `${countdown(left)} left`}>
                        {t.done ? "Done" : countdown(left)}
                      </span>
                      {t.done ? (
                        <Button small onClick={() => act(t.id, "restart")}>
                          Again
                        </Button>
                      ) : (
                        <Button small onClick={() => act(t.id, t.paused ? "resume" : "pause")}>
                          {t.paused ? "Resume" : "Pause"}
                        </Button>
                      )}
                      <Button small variant="quiet" aria-label={`Remove ${t.label}`} onClick={() => act(t.id, "remove")}>
                        ✕
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {view === "pomodoro" && (
        <>
          {pomodoro ? (
            <BigClock
              face={face}
              text={countdown(remainingOf(pomodoro, now))}
              frac={progress(pomodoro.durationMs, remainingOf(pomodoro, now))}
              label={`${phaseName(pomodoro)}: ${countdown(remainingOf(pomodoro, now))} left`}
              sub={`${phaseName(pomodoro)} · round ${Math.min(pomodoro.round + (pomodoro.phase === "focus" ? 1 : 0), pomodoro.pomodoro?.rounds ?? 4)} of ${pomodoro.pomodoro?.rounds ?? 4}`}
            />
          ) : (
            <Empty title="Ready to focus" config={config}>
              {pomo.focusMin} minutes of focus, then a {pomo.breakMin}-minute break. {pomo.dnd ? "Lens notifications stay quiet while you focus." : ""}
            </Empty>
          )}
          {pomodoro && (() => {
            const rounds = pomodoro.pomodoro?.rounds ?? 4;
            const doneInCycle = pomodoro.phase === "longBreak" ? rounds : pomodoro.round % rounds;
            return (
              <div className="tm-rounds" aria-label={`${doneInCycle} of ${rounds} focus rounds done`}>
                {Array.from({ length: rounds }, (_, i) => (
                  <span key={i} className={cx(i < doneInCycle && "on", pomodoro.phase === "focus" && i === doneInCycle && "now")} />
                ))}
              </div>
            );
          })()}
          <Card title="Session" meta={pomodoro ? "applies to the next session" : undefined}>
            <div className="tm-pomo-grid">
              {(
                [
                  ["focusMin", "Focus", 5, 90],
                  ["breakMin", "Break", 1, 30],
                  ["longBreakMin", "Long break", 5, 60],
                  ["rounds", "Rounds before a long break", 2, 8],
                ] as const
              ).map(([k, l, min, max]) => (
                <label key={k} className="tm-num">
                  <span>{l}</span>
                  <span className="ca-row">
                    <Button small aria-label={`Less ${l}`} onClick={() => setPomo((p) => ({ ...p, [k]: Math.max(min, p[k] - (k === "rounds" || k === "breakMin" ? 1 : 5)) }))}>
                      −
                    </Button>
                    <strong>
                      {pomo[k]}
                      {k === "rounds" ? "" : " min"}
                    </strong>
                    <Button small aria-label={`More ${l}`} onClick={() => setPomo((p) => ({ ...p, [k]: Math.min(max, p[k] + (k === "rounds" || k === "breakMin" ? 1 : 5)) }))}>
                      +
                    </Button>
                  </span>
                </label>
              ))}
              <div className="tm-num">
                <span>Quiet notifications while focusing</span>
                <Switch checked={pomo.dnd} label="Turn on Lens Do Not Disturb during focus" onChange={(v) => setPomo((p) => ({ ...p, dnd: v }))} />
              </div>
            </div>
            <p className="ca-muted" style={{ margin: "12px 0 0", fontSize: 12 }}>
              Do Not Disturb goes back to how it was when the focus ends or you end the session.
            </p>
          </Card>
        </>
      )}

      {view === "stopwatch" && (
        <>
          <BigClock face={face === "expressive" ? "classic" : face} text={clock(swNow, true)} label={`Stopwatch ${clock(swNow)}`} sub={swState.running ? "Running" : swNow ? "Stopped" : "Space to start"} />
          {swState.laps.length > 0 ? (
            <Card title="Laps" meta={`${swState.laps.length}`}>
              <ul className="ca-list">
                {splits(swState.laps)
                  .reverse()
                  .map((l) => (
                    <li key={l.n} className="ca-item">
                      <span className="ca-mono" style={{ minWidth: 48 }}>
                        Lap {l.n}
                      </span>
                      <span className="ca-item-main">{l.best ? <Pill tone="ok">Fastest</Pill> : l.worst ? <Pill tone="warn">Slowest</Pill> : null}</span>
                      <span className="ca-item-num">{clock(l.split, true)}</span>
                      <span className="ca-item-num ca-muted">{clock(l.total, true)}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : (
            <p className="ca-note">Space starts and stops, L takes a lap, R resets. The stopwatch keeps counting if you close the window.</p>
          )}
        </>
      )}

      {view === "alarms" && (
        <>
          <Card title="New alarm">
            <div className="ca-row" style={{ flexWrap: "wrap" }}>
              <input className="ca-input tm-time" value={alarmAt} onChange={(e) => setAlarmAt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAlarm()} aria-label="Alarm time" placeholder="7:30" />
              <input className="ca-input" value={alarmLabel} onChange={(e) => setAlarmLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAlarm()} placeholder="Label (optional)" aria-label="Alarm label" />
            </div>
            <div className="ca-row tm-days" role="group" aria-label="Repeat on" style={{ marginTop: 12 }}>
              {DAYS.map((d, i) => (
                <button key={d} type="button" className={cx("tm-day", !!(alarmDays & (1 << i)) && "on")} aria-pressed={!!(alarmDays & (1 << i))} onClick={() => setAlarmDays((m) => toggleDay(m, i))}>
                  {d}
                </button>
              ))}
              <span className="ca-muted" style={{ marginLeft: 8 }}>
                {describeDays(alarmDays)}
              </span>
            </div>
          </Card>
          {alarms.length === 0 ? (
            <Empty title="No alarms" config={config}>
              Alarms ring through Lens notifications, even with this window closed. Lens has to be running.
            </Empty>
          ) : (
            <Card title="Alarms" meta={`${alarms.length}`}>
              <ul className="ca-list">
                {alarms.map((a) => (
                  <li key={a.id} className={cx("ca-item", a.paused && "disabled")}>
                    <span className="tm-alarm-time">
                      {String(a.hour).padStart(2, "0")}:{String(a.minute).padStart(2, "0")}
                    </span>
                    <div className="ca-item-main">
                      <div className="ca-item-title">{a.label}</div>
                      <div className="ca-item-sub">
                        {describeDays(a.weekdays)}
                        {a.endsAtMs ? ` · next ${new Date(a.endsAtMs).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : a.done ? " · rang" : ""}
                      </div>
                    </div>
                    <Switch checked={!a.paused} label={`${a.label} on`} onChange={(v) => act(a.id, v ? "resume" : "pause")} />
                    <Button small variant="quiet" aria-label={`Remove ${a.label}`} onClick={() => act(a.id, "remove")}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};
