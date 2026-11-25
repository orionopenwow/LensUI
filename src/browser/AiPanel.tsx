import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bot, Captions, FileText, Search, Settings2 } from "lucide-react";
import { aiStatus, type AiStatus } from "../ai/client";
import { DEFAULT_BROWSER_AI, type BrowserAi } from "./api";
import { Key } from "./ApprovalCard";

export function Toggle({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange(v: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`lb-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

const FEATURES: { key: keyof Omit<BrowserAi, "enabled">; label: string; sub: string; icon: React.ReactNode }[] = [
  { key: "agentInNewTabs", label: "Agent in new tabs", sub: "New tabs open with an Ask box", icon: <Bot size={14} /> },
  { key: "pageSummaries", label: "Page summaries", sub: "Reader view and Summarise in the menu", icon: <FileText size={14} /> },
  { key: "askInAddressBar", label: "Ask in address bar", sub: "Start with ask… to ask the page", icon: <Search size={14} /> },
  { key: "transcripts", label: "Transcripts", sub: "YouTube transcripts and whisper", icon: <Captions size={14} /> },
];

/** "AI only if you want it" and "Free. Bring your own model". */
export function AiPanel({ value, onChange, status }: { value: BrowserAi; onChange(v: BrowserAi): void; status?: AiStatus | null }) {
  const v = { ...DEFAULT_BROWSER_AI, ...value };
  const [st, setSt] = useState<AiStatus | null>(status ?? null);
  useEffect(() => {
    if (status !== undefined) return;
    aiStatus().then(setSt).catch(() => setSt(null));
  }, [status]);
  const providers = (st?.providers ?? []).filter((p) => p.kind !== "off");
  return (
    <div className="lb-settings">
      <div className="lb-settings-head">
        <h2>AI only if you want it</h2>
        <p className="lb-dim">Turn every AI feature off with one switch, or keep only the ones you use.</p>
      </div>
      <section className="lb-card lb-toggles">
        <div className="lb-toggle-row is-master">
          <span className="lb-toggle-text"><b>AI features</b></span>
          <Toggle on={v.enabled} label="AI features" onChange={(enabled) => onChange({ ...v, enabled })} />
        </div>
        {FEATURES.map((f) => (
          <div key={f.key} className={`lb-toggle-row${v.enabled ? "" : " is-off"}`}>
            <span className="lb-toggle-icon" aria-hidden>{f.icon}</span>
            <span className="lb-toggle-text">
              <span>{f.label}</span>
              <span className="lb-dim">{f.sub}</span>
            </span>
            <Toggle on={v.enabled && v[f.key]} disabled={!v.enabled} label={f.label} onChange={(on) => onChange({ ...v, [f.key]: on })} />
          </div>
        ))}
      </section>

      <div className="lb-settings-head">
        <h2>Free. Bring your own model.</h2>
        <p className="lb-dim">No tiers and no usage caps. Run a model on this PC, use your own Claude key, or any OpenAI-compatible endpoint.</p>
      </div>
      <section className="lb-card lb-providers" aria-label="Models">
        {providers.length === 0 ? <div className="lb-row lb-dim">No model set up yet.</div> : null}
        {providers.map((p) => (
          <div key={p.id} className="lb-provider">
            <span className={`lb-dot ${p.available ? "is-green" : "is-grey"}`} aria-hidden />
            <span className="lb-provider-name">{p.label}</span>
            <span className="lb-mono lb-dim">{p.kind === "script" ? "offline commands" : p.is_local ? "on this PC" : p.needs_key && !p.has_key ? "add a key" : "your key"}{p.model ? ` · ${p.model}` : ""}</span>
            {st?.active === p.id ? <span className="lb-pill lb-push">in use</span> : null}
          </div>
        ))}
        <div className="lb-ok-actions">
          <span className="lb-mono lb-dim">{st ? `privacy: ${st.privacy.replace(/_/g, " ")}` : ""}</span>
          <span className="lb-push" />
          <button className="lb-btn lb-btn-sm" onClick={() => void invoke("open_dock_popout_tab_cmd", { tab: "ai" }).catch(() => {})}>
            <Settings2 size={13} /> AI settings <Key k="⏎" />
          </button>
        </div>
      </section>
    </div>
  );
}
