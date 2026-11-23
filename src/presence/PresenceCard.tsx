// Settings › AI & Command › "Lens at work": Full / Subtle / Off, the locked "always show when an
// outside app is in control" rule, captions, and the "Pause Lens" hotkey.
import { useEffect, useState } from "react";
import { getConfig, setConfig, status } from "./api";
import { hotkeyProblem } from "./model";
import { DEFAULT_CONFIG, type PresenceConfig, type PresenceMode } from "./types";
import "./presence.css";

const MODES: { id: PresenceMode; label: string; note: string }[] = [
  { id: "full", label: "Full", note: "The orb travels, clicks, types and shows each step." },
  { id: "subtle", label: "Subtle", note: "Rings and captions only — no moving orb." },
  { id: "off", label: "Off", note: "Nothing for Lens's own actions. Outside apps still show." },
];

export interface PresenceCardProps {
  /** Parity gallery: render without Tauri. */
  initial?: PresenceConfig;
  hotkeyOk?: boolean;
}

export function PresenceCard({ initial, hotkeyOk: initialOk }: PresenceCardProps = {}) {
  const [cfg, setCfg] = useState<PresenceConfig>(initial ?? DEFAULT_CONFIG);
  const [hotkey, setHotkey] = useState(cfg.pauseHotkey);
  const [hotkeyOk, setHotkeyOk] = useState(initialOk ?? true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    void getConfig().then((c) => {
      setCfg(c);
      setHotkey(c.pauseHotkey);
    });
    void status().then((s) => setHotkeyOk(s.hotkeyOk));
  }, [initial]);

  const save = (next: PresenceConfig) => {
    setCfg(next);
    if (initial) return;
    setConfig(next)
      .then((c) => {
        setCfg(c);
        setErr(null);
        return status();
      })
      .then((s) => s && setHotkeyOk(s.hotkeyOk))
      .catch((e) => setErr(String(e)));
  };

  const problem = hotkeyProblem(hotkey);
  const mode = MODES.find((m) => m.id === cfg.mode) ?? MODES[1];

  return (
    <div className="pr-card" data-guide-id="settings.presence">
      <div className="pr-row">
        <div className="pr-row-text">
          <span className="pr-row-title">Show Lens at work</span>
          <span className="pr-row-sub">{mode.note}</span>
        </div>
        <div className="pr-seg" role="group" aria-label="Show Lens at work">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={cfg.mode === m.id} onClick={() => save({ ...cfg, mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pr-row">
        <div className="pr-row-text">
          <span className="pr-row-title">Always show when an outside app is in control</span>
          <span className="pr-row-sub">Claude Desktop, Claude Code and other AI apps always get rings, captions and a Stop banner.</span>
        </div>
        <button type="button" className="pr-toggle" role="switch" aria-checked="true" aria-label="Always show when an outside app is in control (always on)" disabled />
      </div>
      <div className="pr-row">
        <div className="pr-row-text">
          <span className="pr-row-title">Captions</span>
          <span className="pr-row-sub">Who is acting and which step, e.g. “Lens · Theme → Nord · 2/3”.</span>
        </div>
        <button
          type="button"
          className="pr-toggle"
          role="switch"
          aria-checked={cfg.captions}
          aria-label="Captions"
          onClick={() => save({ ...cfg, captions: !cfg.captions })}
        />
      </div>
      <div className="pr-row">
        <div className="pr-row-text">
          <span className="pr-row-title">Pause Lens</span>
          <span className={`pr-note${problem || !hotkeyOk ? " is-bad" : ""}`}>
            {problem ?? (hotkeyOk ? "Stops whatever Lens or Claude is doing. Esc or clicking the orb works too." : "Another app holds this shortcut — pick a different one.")}
          </span>
        </div>
        <input
          className={`pr-hotkey${problem ? " is-bad" : ""}`}
          aria-label="Pause Lens shortcut"
          value={hotkey}
          spellCheck={false}
          onChange={(e) => setHotkey(e.target.value)}
          onBlur={() => !problem && hotkey !== cfg.pauseHotkey && save({ ...cfg, pauseHotkey: hotkey.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      {err ? <p className="pr-note is-bad">{err}</p> : null}
    </div>
  );
}
