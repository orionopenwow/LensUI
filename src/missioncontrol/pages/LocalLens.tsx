import React, { useEffect, useRef, useState } from "react";
import { call } from "../api";
import { L } from "../loaders";
import { ago } from "../model/pulse";
import { Btn, LoadState, Mono, Muted, Page, Pill, Section, useConfirm, useLoad } from "../ui";

interface LogLine {
  seq: number;
  atMs: number;
  level: string;
  area: string;
  message: string;
}

const LEVELS = ["error", "warn", "info", "debug", "mark"];

export function LocalLens() {
  const confirm = useConfirm();
  const local = useLoad("local", L.local);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [levels, setLevels] = useState<string[]>(["error", "warn", "info", "mark"]);
  const [area, setArea] = useState("");
  const [paused, setPaused] = useState(false);
  const last = useRef(0);
  const [edit, setEdit] = useState<{ path: string; value: string } | null>(null);

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const tick = () =>
      call<LogLine[]>("mc_log_since", { after: last.current, limit: 300 })
        .then((n) => {
          if (!alive || !n.length) return;
          last.current = n[n.length - 1].seq;
          setLines((prev) => [...prev, ...n].slice(-1000));
        })
        .catch(() => {});
    tick();
    const t = window.setInterval(tick, 1500);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [paused]);

  const shown = lines.filter((l) => levels.includes(l.level) && (!area || l.area.includes(area) || l.message.toLowerCase().includes(area.toLowerCase())));
  return (
    <Page title="Local Lens" sub="The Lens running on this PC: its state, live session log, settings (read-only unless you confirm), flags and what Remove all would undo.">
      <LoadState load={local}>
        {(l) => (
          <>
            <Section title="Running">
              <div className="mc-actions">
                <Pill tone="ok">Lens {l.version}</Pill>
                <Muted>pid {l.pid} · up {ago(l.startedMs).replace(" ago", "")} · {l.windows.length} windows</Muted>
                {l.safeMode ? <Pill tone="bad">Safe Mode: {l.safeReason}</Pill> : null}
                <Btn onClick={() => call("open_surface", { label: "testerhub" }).catch(() => {})}>Open Tester Hub</Btn>
              </div>
            </Section>
            <Section
              title="Session log"
              sub={`${shown.length} of ${lines.length} lines (redacted)`}
              actions={
                <Btn weight="medium" onClick={() => setPaused(!paused)} aria-pressed={paused}>
                  {paused ? "Resume" : "Pause"}
                </Btn>
              }
            >
              <div className="mc-filters">
                {LEVELS.map((lv) => (
                  <label key={lv} className="mc-check">
                    <input type="checkbox" checked={levels.includes(lv)} onChange={(e) => setLevels(e.target.checked ? [...levels, lv] : levels.filter((x) => x !== lv))} /> {lv}
                  </label>
                ))}
                <input className="mc-input mc-search" type="search" aria-label="Filter by area or text" placeholder="Area or text" value={area} onChange={(e) => setArea(e.target.value)} data-mc-search />
              </div>
              <div className="mc-logtail" role="log" aria-live="off" data-live>
                {shown.map((x) => (
                  <div key={x.seq} className={`mc-logline is-${x.level}`}>
                    <span className="mc-mono">{new Date(x.atMs).toISOString().slice(11, 19)}</span> <span className="mc-log-area">{x.area}</span> {x.message}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Settings" sub="config.json, redacted (keys and personal paths removed)">
              <pre className="mc-pre mc-config">{l.config}</pre>
            </Section>
            <Section title="Flags" sub="Changes go through Lens's one settings writer after you confirm">
              <ul className="mc-list">
                {l.flags.map((f) => (
                  <li key={f.path} className="mc-row">
                    <span className="mc-row-main mc-mono">{f.path}</span>
                    <Muted>default {String(f.default)}</Muted>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={f.value === true}
                      aria-label={f.path}
                      data-weight="medium"
                      className={`mc-switch ${f.value === true ? "is-on" : ""}`}
                      onClick={() => confirm({ kind: "configSet", path: f.path, value: JSON.stringify(!(f.value === true)), before: JSON.stringify(f.value) }, local.reload)}
                    >
                      <span className="mc-switch-knob" />
                    </button>
                  </li>
                ))}
              </ul>
              {edit ? (
                <div className="mc-actions">
                  <input className="mc-input" aria-label="Setting path" value={edit.path} onChange={(e) => setEdit({ ...edit, path: e.target.value })} placeholder="dock.iconSize" />
                  <input className="mc-input" aria-label="New value (JSON)" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} placeholder="48" />
                  <Btn onClick={() => confirm({ kind: "configSet", path: edit.path, value: edit.value, before: "(current)" }, () => { setEdit(null); local.reload(); })}>Set…</Btn>
                  <Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
                </div>
              ) : (
                <Btn variant="ghost" onClick={() => setEdit({ path: "", value: "" })}>Edit another setting…</Btn>
              )}
            </Section>
            <Section title="Remove all, dry run" sub={`${l.changes.length} kinds of change it would undo — nothing is run from here`}>
              <ul className="mc-list">
                {l.changes.map((c) => (
                  <li key={c.id} className="mc-row is-stack">
                    <div className="mc-row-line">
                      <Pill tone={c.scope === "persistent" ? "warn" : "muted"}>{c.scope}</Pill>
                      <span className="mc-row-main">{c.label}</span>
                      <Mono>{c.id}</Mono>
                    </div>
                    <div className="mc-row-sub">{c.writes.join(" · ")}</div>
                  </li>
                ))}
              </ul>
              <p className="mc-muted">Not changed: {l.notChanged.map((n) => `${n.what} (${n.why})`).join("; ")}</p>
            </Section>
            <Section title="lens.log" sub={l.logPath}>
              <pre className="mc-pre">{l.lensLog.slice(-60).join("\n") || "Empty."}</pre>
            </Section>
          </>
        )}
      </LoadState>
    </Page>
  );
}
