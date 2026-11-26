import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { RunningWindow } from "../types/lens";
import type * as Gen from "../types/generated";
import { FocusDimPreview } from "../surfaces/FocusDimSurface";
import {
  DEFAULT_CAPS, DEFAULT_STYLING, capsNote, dimLabel, isHexColor, normalizeStyling, toHex,
  type StylingCaps, type WindowStyling,
} from "../utils/windowStyling";

/** Mirrors `WindowRule` in src-tauri/src/win_rules.rs. */
export type WindowRule = Gen.WindowRule;

const OPACITY_CHOICES: (number | null)[] = [null, 100, 90, 80, 70, 60, 50];
const CORNER_CHOICES = [
  { id: "default", label: "Theme" },
  { id: "square", label: "Square" },
  { id: "small", label: "Small" },
  { id: "round", label: "Round" },
];

const INACTIVE_CHOICES: (number | null)[] = [null, 90, 80, 70, 60];

const processKey = (name: string) =>
  (name.split(/[\\/]/).pop() ?? name).trim().toLowerCase().replace(/\.exe$/, "");

type PickState = "idle" | "picking";

/** Waits for the user to click another window. Lens returns focus to Settings afterwards. */
async function pickWindow(): Promise<Gen.PickedWindow | null> {
  try {
    const picked = await invoke<Gen.PickedWindow | null>("pick_window_cmd", { timeoutMs: 20000 });
    getCurrentWindow().setFocus().catch(() => {});
    return picked ?? null;
  } catch {
    return null;
  }
}

/** One "Click any window" button with a cancel state, shared by every picker in this card. */
const PickButton: React.FC<{ label: string; onPicked: (w: Gen.PickedWindow) => void; onStatus: (s: string | null) => void }> = ({
  label,
  onPicked,
  onStatus,
}) => {
  const [state, setState] = useState<PickState>("idle");
  const start = async () => {
    setState("picking");
    onStatus("Click the window you want — Esc or Cancel to stop.");
    const w = await pickWindow();
    setState("idle");
    if (!w) {
      onStatus(null);
      return;
    }
    if (w.protected) {
      onStatus(`Lens never touches ${w.process} (games with anti-cheat, shell windows and Lens itself are protected).`);
      return;
    }
    onStatus(null);
    onPicked(w);
  };
  const cancel = () => {
    invoke("cancel_pick_window_cmd").catch(() => {});
    setState("idle");
    onStatus(null);
  };
  useEffect(() => {
    if (state !== "picking") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return state === "picking" ? (
    <button type="button" className="cc-btn-ghost" onClick={cancel} aria-live="polite">
      Cancel picking
    </button>
  ) : (
    <button type="button" className="cc-btn-ghost" onClick={start}>
      {label}
    </button>
  );
};

const ROW_LABEL: React.CSSProperties = { width: 88, flexShrink: 0 };
const SUB_ROW: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, minHeight: 32 };

/** Focus dimming, the active-window border, exclusions and pin on top. Everything is off by default. */
export const WindowStylingCard: React.FC = () => {
  const [styling, setStyling] = useState<WindowStyling>(DEFAULT_STYLING);
  const [caps, setCaps] = useState<StylingCaps>(DEFAULT_CAPS);
  const [pinned, setPinned] = useState<Gen.PinnedWindow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPinned = useCallback(() => {
    invoke<Gen.PinnedWindow[] | null>("list_pinned_windows_cmd")
      .then((p) => setPinned(p ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<Gen.WindowStylingState | null>("get_window_styling_cmd")
      .then((s) => {
        if (!s) return;
        setStyling(normalizeStyling(s.settings));
        if (s.caps) setCaps(s.caps);
      })
      .catch(() => {});
    loadPinned();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loadPinned]);

  // Optimistic: the UI shows the cleaned value at once; saving is debounced for the slider.
  const update = (change: Partial<WindowStyling>, delay = 0) => {
    const next = normalizeStyling({ ...styling, ...change });
    setStyling(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      invoke<WindowStyling>("set_window_styling_cmd", { settings: next })
        .then((clean) => {
          if (clean) setStyling(normalizeStyling(clean));
          setStatus(null);
        })
        .catch((e) => setStatus(`Couldn't save: ${String(e)}`));
    }, delay);
  };
  const border = styling.activeBorder;
  const setBorder = (change: Partial<WindowStyling["activeBorder"]>) => update({ activeBorder: { ...border, ...change } });

  const addExclusion = (name: string) => {
    const key = processKey(name);
    if (!key || styling.exclusions.includes(key)) return;
    update({ exclusions: [...styling.exclusions, key] });
    setManual("");
  };

  const pin = (w: Gen.PickedWindow) => {
    invoke<boolean>("set_window_pinned_cmd", { hwnd: w.hwnd, pinned: true })
      .then(() => loadPinned())
      .catch((e) => setStatus(String(e)));
  };
  const unpin = (hwnd: number) => {
    invoke<boolean>("set_window_pinned_cmd", { hwnd, pinned: false })
      .then(() => loadPinned())
      .catch(() => loadPinned());
  };

  const note = capsNote(caps);
  const nativeDisabled = !caps.nativeBorder;
  const BORDER_MODES = [
    { id: "off", label: "Off" },
    { id: "native", label: "Thin (native)" },
    { id: "overlay", label: "Styled" },
  ];

  return (
    <div className="cc-card">
      <div className="cc-label">Focus &amp; borders</div>
      <div className="cc-desc">
        Dim what you're not using and outline the window you are. Lens draws this on top of your windows — nothing inside
        your apps changes, and fullscreen games and videos are left alone.
      </div>

      <FocusDimPreview styling={styling} caps={caps} />

      {note && (
        <div className="cc-desc" role="note" style={{ padding: "8px 10px", borderRadius: 8, background: "rgb(var(--lens-ink) / 0.05)", border: "1px solid var(--lens-border)" }}>
          {note}
        </div>
      )}

      <div className="cc-row">
        <div>
          <div className="cc-label">Dim inactive windows</div>
          <div className="cc-desc">Darkens everything behind the focused window.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range"
            className="cc-range"
            min={0}
            max={40}
            step={5}
            value={styling.dimInactive}
            aria-label="Dim inactive windows"
            aria-valuetext={dimLabel(styling.dimInactive)}
            onChange={(e) => update({ dimInactive: Number(e.target.value) }, 180)}
          />
          <span className="cc-desc" style={{ width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {dimLabel(styling.dimInactive)}
          </span>
        </div>
      </div>

      <div style={SUB_ROW}>
        <span className="cc-desc" style={ROW_LABEL}>Active border</span>
        <div className="cc-chip-grid">
          {BORDER_MODES.map((m) => {
            const disabled = m.id === "native" && nativeDisabled;
            return (
              <button
                key={m.id}
                type="button"
                className={`cc-chip ${border.mode === m.id ? "active" : ""}`}
                aria-pressed={border.mode === m.id}
                aria-disabled={disabled}
                style={disabled ? { opacity: 0.45, pointerEvents: "none" } : undefined}
                onClick={() => setBorder({ mode: m.id })}
              >
                {m.label}
                {disabled ? " · Needs Windows 11" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {border.mode === "overlay" && (
        <div style={SUB_ROW}>
          <span className="cc-desc" style={ROW_LABEL}>Style</span>
          <div className="cc-chip-grid">
            {[
              { id: "solid", label: "Solid" },
              { id: "gradient", label: "Gradient" },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                className={`cc-chip ${border.style === o.id ? "active" : ""}`}
                aria-pressed={border.style === o.id}
                onClick={() => setBorder({ style: o.id, colors: o.id === "gradient" && border.colors.length < 2 ? [border.colors[0], "#C084FC"] : border.colors })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {border.mode !== "off" && (
        <div style={SUB_ROW}>
          <span className="cc-desc" style={ROW_LABEL}>{border.mode === "overlay" && border.style === "gradient" ? "Colours" : "Colour"}</span>
          <div className="cc-chip-grid" style={{ alignItems: "center" }}>
            {(border.mode === "overlay" && border.style === "gradient" ? border.colors : border.colors.slice(0, 1)).map((c, i) => (
              <span key={`${i}-${c}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <ColorHexInput
                  value={c}
                  label={`Border colour ${i + 1}`}
                  onCommit={(hex) => setBorder({ colors: border.colors.map((x, j) => (j === i ? hex : x)) })}
                />
                {border.style === "gradient" && border.mode === "overlay" && border.colors.length > 2 && (
                  <button
                    type="button"
                    className="cc-btn-ghost"
                    style={{ padding: "4px 8px" }}
                    aria-label={`Remove colour ${i + 1}`}
                    onClick={() => setBorder({ colors: border.colors.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {border.mode === "overlay" && border.style === "gradient" && border.colors.length < 4 && (
              <button type="button" className="cc-chip" onClick={() => setBorder({ colors: [...border.colors, "#F472B6"] })}>
                + Colour
              </button>
            )}
          </div>
        </div>
      )}

      {border.mode === "overlay" && (
        <>
          <div style={SUB_ROW}>
            <span className="cc-desc" style={ROW_LABEL}>Width</span>
            <div className="cc-chip-grid">
              {[1, 2, 3, 4, 6, 8].map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`cc-chip ${border.widthPx === w ? "active" : ""}`}
                  aria-pressed={border.widthPx === w}
                  onClick={() => setBorder({ widthPx: w })}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
          <div style={SUB_ROW}>
            <span className="cc-desc" style={ROW_LABEL}>Glow</span>
            <div className="cc-chip-grid">
              {[
                { v: 0, label: "Off" },
                { v: 6, label: "Soft" },
                { v: 12, label: "Medium" },
                { v: 20, label: "Strong" },
              ].map((g) => (
                <button
                  key={g.v}
                  type="button"
                  className={`cc-chip ${border.glowPx === g.v ? "active" : ""}`}
                  aria-pressed={border.glowPx === g.v}
                  onClick={() => setBorder({ glowPx: g.v })}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="cc-row">
        <div>
          <div className="cc-label">Leave fullscreen apps alone</div>
          <div className="cc-desc">No dimming, border or peek over games, videos and presentations.</div>
        </div>
        <button
          type="button"
          aria-label="Leave fullscreen apps alone"
          aria-pressed={styling.skipFullscreen}
          className={`cc-toggle ${styling.skipFullscreen ? "on" : ""}`}
          onClick={() => update({ skipFullscreen: !styling.skipFullscreen })}
        />
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Never decorate</div>
          <div className="cc-desc">Apps that never get dimming, borders, peek or pinning.</div>
        </div>
        <PickButton label="Pick a window" onStatus={setStatus} onPicked={(w) => addExclusion(w.process)} />
      </div>
      {styling.exclusions.length > 0 && (
        <div className="cc-chip-grid">
          {styling.exclusions.map((e) => (
            <button
              key={e}
              type="button"
              className="cc-chip"
              aria-label={`Remove ${e} from the never-decorate list`}
              onClick={() => update({ exclusions: styling.exclusions.filter((x) => x !== e) })}
            >
              {e} ×
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="cc-input"
          style={{ flex: 1 }}
          placeholder="Process name, e.g. obs64"
          value={manual}
          maxLength={80}
          aria-label="Process name to never decorate"
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addExclusion(manual);
          }}
        />
        <button type="button" className="cc-btn" onClick={() => addExclusion(manual)}>
          Add
        </button>
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Pin a window on top</div>
          <div className="cc-desc">Keeps it above everything else. Lens unpins it again when Lens quits.</div>
        </div>
        <PickButton label="Pick a window" onStatus={setStatus} onPicked={pin} />
      </div>
      {pinned.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pinned.map((p) => (
            <div key={p.hwnd} className="cc-row" style={{ padding: "4px 0" }}>
              <span className="cc-desc" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                <span className="cc-label">{p.process || "Window"}</span> · {p.title || "Untitled"}
              </span>
              <button type="button" className="cc-btn-ghost" onClick={() => unpin(p.hwnd)}>
                Unpin
              </button>
            </div>
          ))}
        </div>
      )}

      {status && (
        <div className="cc-desc" role="status">
          {status}
        </div>
      )}
    </div>
  );
};

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** Focus & Borders, then the per-app rules. Mounted as one card group in Settings › Windows. */
export const WindowRulesCard: React.FC = () => (
  <>
    <WindowStylingCard />
    <PerAppRulesCard />
  </>
);

/** Per-app window rules: opacity, frame and corners for one app, or "leave this app alone". */
const PerAppRulesCard: React.FC = () => {
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
    save([...rules, { match: key, opacity: null, inactiveOpacity: null, frame: "default", corners: "default", exclude: false }]);
    setManual("");
  };

  const candidates = running.filter((n) => n !== "lens-ui" && !rules.some((r) => r.match === n));

  return (
    <div className="cc-card">
      <div className="cc-label">Per-app window rules</div>
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
                  <span className="cc-desc" style={{ width: 58, flexShrink: 0 }}>Inactive</span>
                  <div className="cc-chip-grid">
                    {INACTIVE_CHOICES.map((o) => (
                      <button
                        key={String(o)}
                        type="button"
                        className={`cc-chip ${(rule.inactiveOpacity ?? null) === o ? "active" : ""}`}
                        aria-pressed={(rule.inactiveOpacity ?? null) === o}
                        onClick={() => patch(rule.match, { inactiveOpacity: o })}
                      >
                        {o === null ? "Same" : `${o}%`}
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
          <div className="cc-desc">Click a window, pick an open app, or type its process name.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <PickButton label="Pick a window" onStatus={setStatus} onPicked={(w) => add(w.process)} />
          <button type="button" className="cc-btn-ghost" onClick={loadRunning}>
            Refresh
          </button>
        </div>
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

const FrameHexInput: React.FC<{ value: string; onCommit: (hex: string) => void }> = ({ value, onCommit }) => (
  <ColorHexInput value={value} onCommit={onCommit} label="Frame color (hex)" />
);

const ColorHexInput: React.FC<{ value: string; label: string; onCommit: (hex: string) => void }> = ({ value, label, onCommit }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (isHexColor(draft)) onCommit(toHex(draft));
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
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </span>
  );
};
