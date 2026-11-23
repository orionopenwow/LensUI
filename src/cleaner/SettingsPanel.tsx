// Lens Cleaner settings: everything automatic is off until you turn it on. Shared by the
// Lens Cleaner window (gear) and Settings › Storage (CleanerCard).

import React, { useEffect, useState } from "react";
import type { CleanerSettings } from "./types";
import { api } from "./api";

const Switch: React.FC<{ on: boolean; label: string; desc: string; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, label, desc, onChange, disabled }) => (
  <div className="cl-setting">
    <span className="cl-setting-text">
      <span className="cl-setting-label">{label}</span>
      <span className="cl-meta-line">{desc}</span>
    </span>
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`cl-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span className="cl-switch-knob" />
    </button>
  </div>
);

export const SettingsPanel: React.FC<{ initial?: CleanerSettings | null; storageSense?: boolean | null; onOpen?: (uri: string) => void }> = ({ initial, storageSense, onOpen }) => {
  const [s, setS] = useState<CleanerSettings | null>(initial ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!initial) api.settingsGet().then(setS).catch((e) => setErr(String(e)));
  }, [initial]);
  if (!s) return <div className="cl-meta cl-pad">{err ?? "Loading…"}</div>;
  const set = (patch: Partial<CleanerSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    api
      .settingsSet(next)
      .then((saved) => {
        setS(saved);
        setErr(null);
      })
      .catch((e) => {
        setS(s);
        setErr(String(e));
      });
  };
  return (
    <div className="cl-settings">
      <Switch on={s.weekly} label="Weekly tidy-up" desc="Once a week, clean SAFE caches and temporary files only. Never the Recycle Bin, your files or anything that needs admin. You get a notification." onChange={(v) => set({ weekly: v })} />
      <Switch on={s.lowSpaceAlert} label="Tell me when a drive runs low" desc={`A pill in the Top Bar and one notification a day when a drive has less than ${s.lowSpacePct}% or ${s.lowSpaceGb} GB free.`} onChange={(v) => set({ lowSpaceAlert: v })} />
      <Switch on={s.history} label="Daily space snapshots" desc="Powers “Where did my space go?”. A few lines a day, kept on this PC only." onChange={(v) => set({ history: v })} />
      <Switch on={s.explorerVerb} label="“Free up space with Lens” in File Explorer" desc="Adds it to the right-click menu of drives (your account only). Remove all Lens changes takes it away again." onChange={(v) => set({ explorerVerb: v })} />
      {storageSense != null && (
        <p className="cl-meta-line">
          Windows Storage Sense is {storageSense ? "on" : "off"}.{" "}
          {onOpen && (
            <button type="button" className="cl-link" onClick={() => onOpen("ms-settings:storagesense")}>
              Open Storage Sense
            </button>
          )}
        </p>
      )}
      {err && (
        <p className="cl-error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
};
