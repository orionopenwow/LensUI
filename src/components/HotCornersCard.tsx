import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Timer } from "lucide-react";
import type { LensConfig } from "../types/lens";
import { PillFillBar } from "./PillFillBar";
import {
  CORNER_ACTIONS,
  CORNER_KEYS,
  CORNER_LABELS,
  readHotCorners,
  type CornerKey,
  type HotCornersConfig,
} from "../utils/productivity";
import "./ProductivityCards.css";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const actionLabel = (id: string) => CORNER_ACTIONS.find((a) => a.id === id)?.label ?? "Nothing";

/** Control Center card: hot corners (opt-in). Pick a corner on the little screen, then its action. */
export const HotCornersCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const hc = readHotCorners(config);
  const [selected, setSelected] = useState<CornerKey>("topLeft");
  const [tried, setTried] = useState<string | null>(null);

  const save = (patch: Partial<HotCornersConfig>) =>
    onUpdateConfig({ ...config, hotCorners: { ...hc, ...patch } } as LensConfig);

  const active = CORNER_KEYS.filter((k) => hc[k] !== "none").length;
  const statusLine = !hc.enabled
    ? "Off. Corners do nothing."
    : active === 0
      ? "On, but no corner has an action yet."
      : `${active} ${active === 1 ? "corner" : "corners"} ready · paused in fullscreen apps and while a mouse button is held`;

  const tryAction = () => {
    const action = hc[selected];
    invoke("test_corner_action_cmd", { action })
      .then(() => setTried(null))
      .catch((e) => setTried(String(e)));
  };

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Hot Corners</div>
          <div className="cc-desc">
            Push the pointer into a screen corner and rest it there to open something. Corners between two monitors are
            skipped, so moving across screens never sets one off.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hc.enabled}
          aria-label="Hot Corners"
          className={`cc-toggle ${hc.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !hc.enabled })}
        />
      </div>

      <div className="cc-desc pi-status" aria-live="polite">
        <span className={`pi-dot ${hc.enabled && active > 0 ? "on" : ""}`} />
        {statusLine}
      </div>

      <div className={hc.enabled ? "" : "pi-off"} aria-disabled={!hc.enabled}>
        <div className="hc-screen" role="radiogroup" aria-label="Corner to edit">
          <span className="hc-screen-label">Choose a corner</span>
          {CORNER_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={selected === k}
              aria-label={`${CORNER_LABELS[k]}: ${actionLabel(hc[k])}`}
              data-corner={k}
              className={`hc-corner ${selected === k ? "selected" : ""} ${hc[k] === "none" ? "none" : ""}`}
              onClick={() => setSelected(k)}
            >
              <span className="hc-corner-mark" />
              <span>{actionLabel(hc[k])}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={hc.enabled ? "" : "pi-off"} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="hc-pick-head">
          <div className="cc-label">{CORNER_LABELS[selected]} corner</div>
          <button type="button" className="cc-btn-ghost" disabled={hc[selected] === "none"} onClick={tryAction}>
            Try it
          </button>
        </div>
        <div className="cc-chip-grid">
          {CORNER_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`cc-chip ${hc[selected] === a.id ? "active" : ""}`}
              onClick={() => save({ [selected]: a.id } as Partial<HotCornersConfig>)}
            >
              {a.label}
            </button>
          ))}
        </div>
        {tried && <div className="cc-desc">{tried}</div>}

        <PillFillBar
          label="Rest Time"
          value={hc.dwellMs}
          min={0}
          max={1000}
          step={50}
          unit="ms"
          fillColor="#60A5FA"
          icon={<Timer size={14} strokeWidth={2.4} />}
          onChange={(v) => save({ dwellMs: Math.round(v / 50) * 50 })}
        />

        <div className="cc-row">
          <div>
            <div className="cc-label">Every Monitor</div>
            <div className="cc-desc">Off: only the main monitor's corners</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hc.allMonitors}
            aria-label="Hot corners on every monitor"
            className={`cc-toggle ${hc.allMonitors ? "on" : ""}`}
            onClick={() => save({ allMonitors: !hc.allMonitors })}
          />
        </div>
      </div>
    </div>
  );
};
