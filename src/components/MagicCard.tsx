import React, { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { LensConfig } from "../types/lens";
import { readAltDrag, readAppSummon, normalizeApp } from "../utils/productivity";
import {
  DEFAULT_MAGIC, magicCheck, magicGetConfig, magicSetConfig, magicStatus, type ConflictDto, type MagicConfig,
  type MagicStatus,
} from "../magic/contract";
import { MagicSurface } from "../magic/MagicSurface";
import { PREVIEW_TARGETS, previewOpen } from "../magic/previews";
import "../magic/magic.css";

interface Props {
  config: LensConfig;
  /** Tests and parity pass a starting state instead of reading the backend. */
  initial?: { magic: MagicConfig; status?: MagicStatus; conflicts?: ConflictDto[] };
}

const TRIGGERS: { id: string; title: string; desc: string }[] = [
  { id: "ctrl-alt-right", title: "Ctrl + Alt + right-click", desc: "Recommended. Nothing else in Lens or Windows uses it." },
  { id: "hold-right", title: "Hold right-click", desc: "Hold the right button still. A normal click still reaches the app." },
  { id: "ctrl-middle", title: "Ctrl + middle-click", desc: "Browsers use this to open links in a tab." },
  { id: "hotkey", title: "Hotkey only", desc: "Opens at the pointer from the keyboard. No mouse watching." },
];

const Toggle: React.FC<{ label: string; desc: string; on: boolean; onChange: () => void; disabled?: boolean }> = ({ label, desc, on, onChange, disabled }) => (
  <div className="cc-row">
    <div>
      <div className="cc-label">{label}</div>
      <div className="cc-desc">{desc}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`cc-toggle ${on ? "on" : ""}`}
      onClick={onChange}
    />
  </div>
);

/** Control Center card for the magic right-click window. Off by default. */
export const MagicCard: React.FC<Props> = ({ config, initial }) => {
  const [m, setM] = useState<MagicConfig>(initial?.magic ?? DEFAULT_MAGIC);
  const [status, setStatus] = useState<MagicStatus | null>(initial?.status ?? null);
  const [conflicts, setConflicts] = useState<ConflictDto[]>(initial?.conflicts ?? []);
  const [newApp, setNewApp] = useState("");
  const [preview, setPreview] = useState(PREVIEW_TARGETS[0].id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    magicGetConfig().then(setM).catch(() => {});
    magicStatus().then(setStatus).catch(() => {});
  }, [initial]);

  const ad = readAltDrag(config);
  // A string, so a fresh array from the config reader doesn't re-run the check on every render.
  const summonKeys = readAppSummon(config)
    .bindings.filter((b) => b.enabled)
    .map((b) => b.hotkey)
    .join("\n");
  useEffect(() => {
    if (initial?.conflicts) return;
    magicCheck(m, {
      altDragEnabled: ad.enabled,
      altDragModifier: ad.modifier,
      altDragResize: ad.resize,
      summonHotkeys: summonKeys ? summonKeys.split("\n") : [],
    })
      .then(setConflicts)
      .catch(() => {});
  }, [m, ad.enabled, ad.modifier, ad.resize, summonKeys, initial?.conflicts]);

  const save = (patch: Partial<MagicConfig>) => {
    const next = { ...m, ...patch };
    setM(next);
    setError(null);
    if (initial) return;
    magicSetConfig(next).then(setStatus).catch((e) => setError(String(e)));
  };

  const addApp = () => {
    const app = normalizeApp(newApp);
    setNewApp("");
    if (!app || m.exclude.includes(app)) return;
    save({ exclude: [...m.exclude, app] });
  };

  const blocked = conflicts.some((c) => c.level === "block");
  const statusLine = (() => {
    if (!m.enabled) return { text: "Off. Right-clicks work exactly as before.", tone: "" };
    if (!status) return { text: "Starting…", tone: "" };
    if (m.trigger !== "hotkey" && !status.hookActive) return { text: status.lastProblem || "Waiting for Windows to allow the mouse watcher…", tone: "warn" };
    const t = TRIGGERS.find((x) => x.id === m.trigger)?.title ?? "";
    const timing = status.lastOpenMs ? ` · last opened in ${status.lastOpenMs} ms` : "";
    return { text: `Ready · ${m.trigger === "hotkey" ? m.hotkey : t}${timing}`, tone: "on" };
  })();

  const open = useMemo(() => previewOpen(preview), [preview]);

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Magic Right-Click</div>
          <div className="cc-desc">
            One Lens window at the pointer, anywhere: what's under it, the right actions, window controls and an Ask box.
            Games, fullscreen apps and administrator windows are left alone.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={m.enabled}
          aria-label="Magic right-click window"
          className={`cc-toggle ${m.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !m.enabled })}
        />
      </div>
      <div className="cc-desc pi-status" aria-live="polite">
        <span className={`pi-dot ${statusLine.tone}`} />
        {statusLine.text}
      </div>
      {error ? <div className="cc-desc" role="alert">{error}</div> : null}

      <div className={m.enabled ? "" : "pi-off"} aria-disabled={!m.enabled} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="cc-label">Open With</div>
          <div className="magic-card-triggers" role="radiogroup" aria-label="Open with" style={{ marginTop: 8 }}>
            {TRIGGERS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={m.trigger === t.id}
                className={`magic-trigger${m.trigger === t.id ? " is-on" : ""}`}
                onClick={() => save({ trigger: t.id })}
              >
                <span className="magic-trigger-title">{t.title}</span>
                <span className="magic-trigger-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {m.trigger === "hold-right" ? (
          <div className="magic-card-row">
            <label htmlFor="magic-hold">Hold for</label>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="magic-hold"
                type="range"
                min={200}
                max={1000}
                step={50}
                value={m.holdMs}
                onChange={(e) => save({ holdMs: Number(e.target.value) })}
              />
              <span className="magic-mono" style={{ width: 52, textAlign: "right" }}>{m.holdMs} ms</span>
            </span>
          </div>
        ) : null}

        <div className="magic-card-row">
          <label htmlFor="magic-hotkey">Hotkey (opens at the pointer)</label>
          <input id="magic-hotkey" type="text" value={m.hotkey} placeholder="none" onChange={(e) => save({ hotkey: e.target.value })} />
        </div>

        {conflicts.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-live="polite">
            {conflicts.map((c) => (
              <div key={c.code} className="magic-conflict">
                <span className={`magic-dot is-${c.level === "block" ? "warn" : "quiet"}`} aria-hidden style={{ marginTop: 4 }} />
                <span>{c.message}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <div className="cc-label">Starts In</div>
          <div className="cc-chip-grid" style={{ marginTop: 8 }}>
            {(["do", "ask"] as const).map((x) => (
              <button
                key={x}
                type="button"
                className={`cc-chip ${m.defaultMode === x ? "active" : ""}`}
                disabled={x === "ask" && !m.ai}
                onClick={() => save({ defaultMode: x })}
              >
                {x === "do" ? "Actions" : "Ask"}
              </button>
            ))}
          </div>
        </div>

        <div className="magic-card-row">
          <label htmlFor="magic-rows">Actions before “More”</label>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input id="magic-rows" type="range" min={3} max={9} value={m.maxRows} onChange={(e) => save({ maxRows: Number(e.target.value) })} />
            <span className="magic-mono" style={{ width: 16, textAlign: "right" }}>{m.maxRows}</span>
          </span>
        </div>

        <Toggle label="Window Actions" desc="Minimise, snap, move, pin and close for the window under the pointer" on={m.windowActions} onChange={() => save({ windowActions: !m.windowActions })} />
        <Toggle
          label="AI in This Window"
          desc="Ask box and AI actions. Uses your AI settings and privacy mode; off hides them here."
          on={m.ai}
          onChange={() => save({ ai: !m.ai, defaultMode: !m.ai ? m.defaultMode : "do" })}
        />
        <Toggle label="Frequent First" desc="Actions you use most move up. Counts stay on this PC." on={m.learn} onChange={() => save({ learn: !m.learn })} />

        <div>
          <div className="cc-label">Leave These Apps Alone</div>
          <div className="cc-desc">The gesture goes to the app as usual, e.g. games or design tools.</div>
        </div>
        <div className="cc-chip-grid">
          {m.exclude.map((app) => (
            <span key={app} className="cc-chip pi-app-chip">
              {app.replace(/\.exe$/, "")}
              <button type="button" className="pi-app-chip-x" aria-label={`Allow ${app} again`} onClick={() => save({ exclude: m.exclude.filter((a) => a !== app) })}>
                <X size={11} strokeWidth={2.6} />
              </button>
            </span>
          ))}
          <span className="pi-app-add">
            <input
              className="cc-input"
              value={newApp}
              placeholder="app.exe"
              aria-label="App to leave alone"
              onChange={(e) => setNewApp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addApp();
              }}
            />
            <button type="button" className="cc-btn-ghost" onClick={addApp} aria-label="Add app">
              <Plus size={13} strokeWidth={2.6} />
            </button>
          </span>
        </div>

        <div>
          <div className="cc-label">Preview</div>
          <div className="magic-preview-tabs" role="tablist" aria-label="Preview for" style={{ margin: "8px 0" }}>
            {PREVIEW_TARGETS.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={preview === p.id} className={`cc-chip ${preview === p.id ? "active" : ""}`} onClick={() => setPreview(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="magic-preview-box">
            <MagicSurface key={preview} initial={{ open, cfg: { ...m, enabled: true }, preview: true }} />
          </div>
        </div>
        {blocked ? <div className="cc-desc">Fix the warning above to use this trigger.</div> : null}
      </div>
    </div>
  );
};

export default MagicCard;
