import React, { useEffect, useState } from "react";
import { messagesApi } from "../messages/api";
import type { AppDto, MessagesSettings } from "../messages/model";
import { AppGlyph } from "../messages/Inbox";

/** Settings › Messages. Messengers run as their own official web apps in sandboxed spaces; Lens
 *  reads only the unread badge. Matrix is the one place Lens can read and send (with approval). */
export function MessagesCard() {
  const [s, setS] = useState<MessagesSettings | null>(null);
  const [apps, setApps] = useState<AppDto[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  // Why the notification mirror shows nothing (for example: this build isn't packaged).
  const [mirrorNote, setMirrorNote] = useState("");
  const mirrorOn = !!s?.mirrorToasts;
  useEffect(() => {
    setMirrorNote("");
    if (!mirrorOn) return;
    let alive = true;
    // After the switch has been saved, so Rust sees it as on.
    const t = window.setTimeout(() => {
      messagesApi.mirrorStatus().then((r) => alive && setMirrorNote(r.note)).catch(() => {});
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [mirrorOn]);
  useEffect(() => {
    messagesApi.settings().then(setS).catch(() => {});
    messagesApi.catalogue().then(setApps).catch(() => {});
  }, []);
  if (!s) return null;
  const save = (patch: Partial<MessagesSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    void messagesApi.setSettings(next).then(setS).catch((e) => setMsg(String(e)));
  };
  const toggle = (on: boolean, label: string, onChange: () => void) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={onChange} />
  );
  const list = (v: string[]) => v.join(", ");
  const parse = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Messages</div>
          <div className="cc-desc">One inbox over the messengers you already use. Each runs as its own web app in a separate space with its own sign-in — Lens sees only the unread count.</div>
        </div>
        {toggle(s.enabled, "Messages", () => save({ enabled: !s.enabled }))}
      </div>

      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {apps.map((a) => {
          const on = s.apps.includes(a.id);
          return (
            <div key={a.id} className="cc-row" style={{ gap: 8 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                <AppGlyph app={a.id} title={a.name} size={22} />
                <span style={{ minWidth: 0 }}>
                  <div className="cc-label" style={{ fontSize: 12.5 }}>{a.name}</div>
                  <div className="cc-desc">{a.note}</div>
                </span>
              </span>
              {toggle(on, a.name, () => save({ apps: on ? s.apps.filter((x) => x !== a.id) : [...s.apps, a.id] }))}
            </div>
          );
        })}
      </div>

      <div className="cc-row" style={{ marginTop: 14 }}>
        <div>
          <div className="cc-label">Mirror notifications</div>
          <div className="cc-desc">Use Windows notifications from these apps for badges and mention alerts. Needs notification access for Lens.</div>
        </div>
        {toggle(s.mirrorToasts, "Mirror notifications", () => save({ mirrorToasts: !s.mirrorToasts }))}
      </div>
      {s.mirrorToasts && mirrorNote && <div className="cc-desc" role="status">{mirrorNote}</div>}
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Show previews</div>
          <div className="cc-desc">Show the first line of new messages in the inbox where the source provides it.</div>
        </div>
        {toggle(s.showPreviews, "Show previews", () => save({ showPreviews: !s.showPreviews }))}
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Badges on Dock icons</div>
        </div>
        {toggle(s.dockBadges, "Badges on Dock icons", () => save({ dockBadges: !s.dockBadges }))}
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="cc-label">VIPs</div>
        <div className="cc-desc">Conversation names that always get through Focus, separated by commas.</div>
        <input className="cc-input" aria-label="VIPs" style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }} defaultValue={list(s.vip)} onBlur={(e) => save({ vip: parse(e.target.value) })} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="cc-label">Alert keywords</div>
        <div className="cc-desc">Your name, project names — a message containing one counts as a mention.</div>
        <input className="cc-input" aria-label="Alert keywords" style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }} defaultValue={list(s.keywords)} onBlur={(e) => save({ keywords: parse(e.target.value) })} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="cc-label">Matrix (advanced)</div>
        <div className="cc-desc">Connect your own Matrix homeserver — including bridges you run yourself — to read rooms and reply from Lens. Every reply shows you the exact text and waits for you to hold Send.</div>
        <div className="cc-row" style={{ gap: 6, marginTop: 6 }}>
          <input className="cc-input" aria-label="Homeserver" placeholder="https://matrix.example.org" defaultValue={s.matrixHomeserver ?? ""} onBlur={(e) => save({ matrixHomeserver: e.target.value.trim() || null })} />
          <input className="cc-input" aria-label="Matrix user" placeholder="@you:example.org" defaultValue={s.matrixUser ?? ""} onBlur={(e) => save({ matrixUser: e.target.value.trim() || null })} />
        </div>
        <div className="cc-row" style={{ gap: 6, marginTop: 6 }}>
          <input className="cc-input" aria-label="Matrix password" type="password" placeholder="Password (not stored — only the session token is)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
          <button className="cc-btn" onClick={() => void messagesApi.matrixLogin(pw).then(() => { setPw(""); setMsg("Matrix connected."); }).catch((e) => setMsg(String(e)))}>Sign in</button>
          <button className="cc-btn" onClick={() => void messagesApi.matrixLogout().then(() => setMsg("Signed out of Matrix.")).catch((e) => setMsg(String(e)))}>Sign out</button>
        </div>
      </div>
      {msg ? <div className="cc-desc" role="status" style={{ marginTop: 10 }}>{msg}</div> : null}
    </div>
  );
}
