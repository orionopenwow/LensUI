import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RunningWindow } from "../types/lens";

/** Mirrors `WindowRule` in src-tauri/src/win_rules.rs. */
export interface WindowRule {
  /** Process name without ".exe", lower-case. */
  match: string;
  /** 40–100, or null to follow the theme. */
  opacity: number | null;
  /** "default" | "none" | "#RRGGBB" */
  frame: string;
  /** "default" | "square" | "small" | "round" */
  corners: string;
  exclude: boolean;
}

const OPACITY_CHOICES: (number | null)[] = [null, 100, 90, 80, 70, 60, 50];
const CORNER_CHOICES = [
  { id: "default", label: "Theme" },
  { id: "square", label: "Square" },
  { id: "small", label: "Small" },
  { id: "round", label: "Round" },
];

const processKey = (name: string) =>
  (name.split(/[\\/]/).pop() ?? name).trim().toLowerCase().replace(/\.exe$/, "");

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** Per-app window rules: opacity, frame and corners for one app, or "leave this app alone". */
export const WindowRulesCard: React.FC = () => {
  const [rules, setRules] = useState<WindowRule[]>([]);
  const [running, setRunning] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const loadRunning = useCallback(() => {
    invoke<RunningWindow[]>("get_running_windows")
      .then((wins) => {
        const names = Array.from(new Set(wins.map((w) => processKey(w.processName)).filter(Boolean)));
        setRunning(names.sort());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<WindowRule[]>("get_window_rules_cmd")
      .then(setRules)
      .catch(() => {});
    loadRunning();
  }, [loadRunning]);

  // The backend cleans the rules and returns what is actually in force.
  const save = (next: WindowRule[]) => {
    setRules(next);
    invoke<WindowRule[]>("set_window_rules_cmd", { rules: next })
      .then((clean) => {
        setRules(clean);
        setStatus(null);
      })
      .catch((e) => setStatus(`Couldn't save rules: ${String(e)}`));
  };

  const patch = (match: string, change: Partial<WindowRule>) =>
    save(rules.map((r) => (r.match === match ? { ...r, ...change } : r)));

  const add = (name: string) => {
    const key = processKey(name);
    if (!key || rules.some((r) => r.match === key)) return;
    save([...rules, { match: key, opacity: null, frame: "default", corners: "default", exclude: false }]);
    setManual("");
  };

  const candidates = running.filter((n) => n !== "lens-ui" && !rules.some((r) => r.match === n));

  return (
    <div className="cc-card">
      <div className="cc-label">Per-App Window Rules</div>
      <div className="cc-desc">
        Give one app its own opacity, frame and corners — or have Lens leave its windows alone entirely.
      </div>

      {rules.map((rule) => {
        const customFrame = rule.frame !== "default" && rule.frame !== "none";
        return (
          <div key={rule.match} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="cc-row" style={{ padding: "6px 0" }}>
              <span className="cc-label">{rule.match}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="cc-desc">Leave alone</span>
                <button
                  type="button"
                  aria-label={`Leave ${rule.match} windows alone`}
                  aria-pressed={rule.exclude}
                  className={`cc-toggle ${rule.exclude ? "on" : ""}`}
                  onClick={() => patch(rule.match, { exclude: !rule.exclude })}
                />
                <button
                  type="button"
                  className="cc-btn-ghost"
                  onClick={() => save(rules.filter((r) => r.match !== rule.match))}
                >
                  Remove
                </button>
              </div>
            </div>

            {!rule.exclude && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="cc-desc" style={{ width: 58, flexShrink: 0 }}>Opacity</span>
                  <div className="cc-chip-grid">
                    {OPACITY_CHOICES.map((o) => (
                      <button
                        key={String(o)}
                        type="button"
                        className={`cc-chip ${rule.opacity === o ? "active" : ""}`}
                        onClick={() => patch(rule.match, { opacity: o })}
                      >
                        {o === null ? "Theme" : `${o}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="cc-desc" style={{ width: 58, flexShrink: 0 }}>Frame</span>
                  <div className="cc-chip-grid" style={{ alignItems: "center" }}>
                    <button
                      type="button"
                      className={`cc-chip ${rule.frame === "default" ? "active" : ""}`}
                      onClick={() => patch(rule.match, { frame: "default" })}
                    >
                      Theme
                    </button>
                    <button
                      type="button"
                      className={`cc-chip ${rule.frame === "none" ? "active" : ""}`}
                      onClick={() => patch(rule.match, { frame: "none" })}
                    >
                      Borderless
                    </button>
                    <button
                      type="button"
                      className={`cc-chip ${customFrame ? "active" : ""}`}
                      onClick={() => {
                        if (!customFrame) patch(rule.match, { frame: "#60A5FA" });
                      }}
                    >
                      Color
                    </button>
                    {customFrame && (
                      <FrameHexInput value={rule.frame} onCommit={(hex) => patch(rule.match, { frame: hex })} />
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="cc-desc" style={{ width: 58, flexShrink: 0 }}>Corners</span>
                  <div className="cc-chip-grid">
                    {CORNER_CHOICES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`cc-chip ${rule.corners === c.id ? "active" : ""}`}
                        onClick={() => patch(rule.match, { corners: c.id })}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="cc-row">
        <div>
          <div className="cc-label">Add a rule</div>
          <div className="cc-desc">Pick an app that is open, or type its process name.</div>
        </div>
        <button type="button" className="cc-btn-ghost" onClick={loadRunning}>
          Refresh
        </button>
      </div>
      {candidates.length > 0 && (
        <div className="cc-chip-grid">
          {candidates.map((n) => (
            <button key={n} type="button" className="cc-chip" onClick={() => add(n)}>
              + {n}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="cc-input"
          style={{ flex: 1 }}
          placeholder="e.g. WindowsTerminal"
          value={manual}
          maxLength={80}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(manual);
          }}
        />
        <button type="button" className="cc-btn" onClick={() => add(manual)}>
          Add
        </button>
      </div>

      {status && <div className="cc-desc">{status}</div>}
    </div>
  );
};

const FrameHexInput: React.FC<{ value: string; onCommit: (hex: string) => void }> = ({ value, onCommit }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const hex = draft.startsWith("#") ? draft : `#${draft}`;
    if (isHex(hex)) onCommit(hex.toUpperCase());
    else setDraft(value);
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: isHex(draft) ? draft : value,
          border: "1px solid var(--lens-border-strong)",
        }}
      />
      <input
        className="cc-input"
        style={{ width: 92 }}
        value={draft}
        maxLength={7}
        aria-label="Frame color (hex)"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </span>
  );
};
