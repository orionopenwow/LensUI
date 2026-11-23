// Control Center card: "Agent safety" (W8-O).
// Sections: the signed-out agent profile, signed-in sites (grants), guard sensitivity, and the
// quarantine viewer showing text Lens set aside so the AI wouldn't follow it.
import React, { useEffect, useState } from "react";
import { Clock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import {
  DEFAULT_SAFETY_SETTINGS, grantExpiryLabel, safetyGrant, safetyGrants, safetyQuarantine, safetyQuarantineClear, safetyRevoke, safetyRevokeAll,
  safetySettingsGet, safetySettingsSet,
  type SafetyGrant, type SafetyQuarantineEntry, type SafetySettings,
} from "./contract";
import "./agentsafe.css";

const SENSITIVITY: { id: string; label: string; desc: string }[] = [
  { id: "relaxed", label: "Relaxed", desc: "Fewer prompts. Risky sites show a banner; Lens still blocks clear scams and hidden instructions." },
  { id: "balanced", label: "Balanced", desc: "Asks before typing, submitting or sending on suspicious sites. Recommended." },
  { id: "strict", label: "Strict", desc: "Also asks the first time an agent types on any new site." },
];

export const AgentSafetyCard: React.FC<{ nowSec?: number }> = ({ nowSec }) => {
  const [s, setS] = useState<SafetySettings>(DEFAULT_SAFETY_SETTINGS);
  const [grants, setGrants] = useState<SafetyGrant[]>([]);
  const [quarantine, setQuarantine] = useState<SafetyQuarantineEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [site, setSite] = useState("");
  const [msg, setMsg] = useState("");
  const now = nowSec ?? Math.floor(Date.now() / 1000);

  const reload = () => {
    safetySettingsGet().then(setS).catch(() => {});
    safetyGrants().then(setGrants).catch(() => setGrants([]));
    safetyQuarantine().then(setQuarantine).catch(() => setQuarantine([]));
  };
  useEffect(reload, []);

  const save = (patch: Partial<SafetySettings>) =>
    safetySettingsSet({ ...s, ...patch }).then(setS).catch((e) => setMsg(String(e)));

  const addSite = () => {
    const v = site.trim();
    if (!v) return;
    safetyGrant(v, "day")
      .then(() => {
        setSite("");
        setMsg("");
        reload();
      })
      .catch((e) => setMsg(String(e)));
  };

  const toggle = (key: "domainGuard" | "injectionGuard" | "bannerForPeople", label: string, desc: string) => (
    <div className="cc-row" style={{ marginTop: 12 }}>
      <div>
        <div className="cc-label">{label}</div>
        <div className="cc-desc">{desc}</div>
      </div>
      <button type="button" role="switch" aria-checked={s[key]} aria-label={label}
        className={`cc-toggle ${s[key] ? "on" : ""}`} onClick={() => save({ [key]: !s[key] } as Partial<SafetySettings>)} />
    </div>
  );

  return (
    <div className="cc-card" data-guide-id="settings.agentsafe">
      <div className="cc-row">
        <div>
          <div className="cc-label">Agent safety</div>
          <div className="cc-desc">
            Checks every step an AI agent takes, from Lens, voice or Claude, before it runs. It works on this PC and sends nothing anywhere.
          </div>
        </div>
      </div>

      <div className="as-section-title">Agent browser profile</div>
      <div className="as-list">
        <div className="as-list-row">
          <div>
            <div className="as-site" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ShieldCheck size={14} strokeWidth={2.4} aria-hidden="true" /> Signed out by default
            </div>
            <div className="cc-desc">Agents browse in a clean profile with no cookies or logins. It's cleared after every run.</div>
          </div>
          <span className="as-mono">always on</span>
        </div>
      </div>

      <div className="as-section-title">Signed-in sites</div>
      <div className="cc-desc" style={{ marginBottom: 8 }}>
        Let an agent act as you on one site, for one run or until this time tomorrow. Nothing is copied; you can remove access any time.
      </div>
      <div className="as-list" role="list" aria-label="Sites with signed-in access">
        {grants.length === 0 ? (
          <div className="as-empty">No sites. Agents will ask when a step needs you signed in.</div>
        ) : (
          grants.map((g) => (
            <div className="as-list-row" role="listitem" key={g.site}>
              <div>
                <div className="as-site">{g.site}</div>
                <div className="as-mono" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Clock size={11} strokeWidth={2.4} aria-hidden="true" />
                  {grantExpiryLabel(g, now)}{g.space ? ` · ${g.space} Space` : ""}
                </div>
              </div>
              <button type="button" className="as-btn" aria-label={`Remove access for ${g.site}`} onClick={() => safetyRevoke(g.site).then(reload)}>
                <X size={12} strokeWidth={2.6} aria-hidden="true" /> Remove
              </button>
            </div>
          ))
        )}
      </div>
      <div className="as-add">
        <input className="cc-input" placeholder="opentable.com" value={site} aria-label="Site to allow for today"
          onChange={(e) => setSite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSite()} />
        <button type="button" className="as-btn" onClick={addSite}><Plus size={12} strokeWidth={2.6} aria-hidden="true" /> Allow for today</button>
        {grants.length > 1 ? <button type="button" className="as-btn" onClick={() => safetyRevokeAll().then(reload)}>Remove all</button> : null}
      </div>

      <div className="as-section-title">Guard</div>
      <div className="as-segment" role="radiogroup" aria-label="How careful the guard is">
        {SENSITIVITY.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={s.sensitivity === o.id} onClick={() => save({ sensitivity: o.id })}>{o.label}</button>
        ))}
      </div>
      <div className="cc-desc" style={{ marginTop: 8 }}>{SENSITIVITY.find((o) => o.id === s.sensitivity)?.desc}</div>
      {toggle("domainGuard", "Look-alike and scam site check", "Spots fake versions of real sites (paypa1.com, Cyrillic letters, brand-login.xyz) before anything is typed or sent.")}
      {toggle("injectionGuard", "Hidden instruction check", "Finds text on pages, screenshots and files that tries to give the AI orders, including text you can't see. It's set aside, not followed.")}
      {toggle("bannerForPeople", "Warn me too", "Show the look-alike banner when you browse by hand, not only for agents.")}

      <div className="as-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Set aside ({quarantine.length})</span>
        {quarantine.length ? (
          <button type="button" className="as-btn" onClick={() => safetyQuarantineClear().then(reload)}>
            <Trash2 size={12} strokeWidth={2.4} aria-hidden="true" /> Clear
          </button>
        ) : null}
      </div>
      <div className="as-list" role="list" aria-label="Text set aside from the AI">
        {quarantine.length === 0 ? (
          <div className="as-empty">Nothing yet. Text Lens keeps from the AI shows up here so you can see it. It's kept in memory only.</div>
        ) : (
          quarantine.slice(0, 30).map((q) => (
            <div className="as-list-row" role="listitem" key={q.id} style={{ gridTemplateColumns: "1fr" }}>
              <button type="button" style={{ textAlign: "left" }} aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
                <div className="as-site">{q.reason}</div>
                <div className="as-mono">{q.source} · {new Date(q.at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
              </button>
              {open === q.id ? <div className="as-quote">{q.text}</div> : null}
            </div>
          ))
        )}
      </div>
      {msg ? <div className="cc-desc" role="alert" style={{ marginTop: 8, color: "var(--lens-danger)" }}>{msg}</div> : null}
    </div>
  );
};
