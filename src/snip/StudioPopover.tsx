// One card per studio action that leaves the studio. It always says what goes where before it
// happens. Split out of Studio.tsx.
import React from "react";
import type { RecentTarget, SnipInfo, WindowInfo } from "./api";

export const LANGS = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Korean", "Chinese (Simplified)", "Arabic", "Hindi"];

export type Popover = null | "claude" | "ask" | "translate" | "openIn";

export interface PopoverProps {
  kind: Exclude<Popover, null>;
  isLocal: boolean;
  providerLabel: string;
  aiOn: boolean;
  ocrChars: number;
  info: SnipInfo;
  askText: string;
  setAskText: (s: string) => void;
  lang: string;
  setLang: (s: string) => void;
  apps: WindowInfo[];
  recent: RecentTarget[];
  running: boolean;
  consent: { callId: string; summary: string } | null;
  onConsent: (ok: boolean) => void;
  onCancel: () => void;
  onClaude: (target: "desktop" | "command") => void;
  onAsk: () => void;
  onTranslate: () => void;
  onOpenIn: (exe: string) => void;
}

/** One card per action that leaves the studio — always says what goes where before it happens. */
export const PopoverCard: React.FC<PopoverProps> = (p) => {
  const dest = (
    <span className={`snip-badge ${p.isLocal ? "local" : "cloud"}`}>{p.isLocal ? "Stays on this PC" : `Sent to ${p.providerLabel}`}</span>
  );
  if (p.kind === "claude") {
    return (
      <div className="snip-card" role="dialog" aria-label="Paste to Claude">
        <div className="q">Paste to Claude</div>
        <div className="snip-muted">Pick where it goes. Nothing is sent until you press Send there.</div>
        <button type="button" className="snip-option" data-weight="heavy" onClick={() => p.onClaude("desktop")}>
          <b>Claude Desktop</b>
          <span>Copies the image and brings Claude forward. You press Ctrl+V.</span>
          <span className="snip-badge local">Lens sends nothing</span>
        </button>
        <button type="button" className="snip-option" data-weight="heavy" onClick={() => p.onClaude("command")}>
          <b>Lens Command</b>
          <span>Attaches the image and its text. Answered by {p.providerLabel}.</span>
          {dest}
        </button>
        <table>
          <tbody>
            <tr><td>Image</td><td>{p.info.w} × {p.info.h}, with your marks and hidden areas</td></tr>
            <tr><td>Text</td><td>{p.ocrChars ? `${p.ocrChars.toLocaleString()} characters from OCR` : "None"}</td></tr>
          </tbody>
        </table>
        <div className="row">
          <button type="button" className="snip-btn" data-weight="medium" onClick={p.onCancel}>Cancel</button>
        </div>
      </div>
    );
  }
  if (p.kind === "ask") {
    return (
      <div className="snip-card" role="dialog" aria-label="Ask about this snip">
        <div className="q">Ask about this snip</div>
        <input className="snip-input" autoFocus placeholder="What does this error mean?" value={p.askText} onChange={(e) => p.setAskText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && p.onAsk()} />
        <div className="snip-muted">Opens in Lens Command with the image and its text attached. Your AI settings decide where it's answered.</div>
        <div className="row">
          <button type="button" className="snip-btn" data-weight="medium" onClick={p.onCancel}>Cancel</button>
          <button type="button" className="snip-btn primary" data-weight="heavy" onClick={p.onAsk}>Ask</button>
        </div>
      </div>
    );
  }
  if (p.kind === "translate") {
    return (
      <div className="snip-card" role="dialog" aria-label="Translate">
        <div className="q">Translate the text in place</div>
        <select className="snip-input" value={p.lang} onChange={(e) => p.setLang(e.target.value)} aria-label="Language">
          {LANGS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <table>
          <tbody>
            <tr><td>Sends</td><td>{p.ocrChars.toLocaleString()} characters of text (not the image)</td></tr>
            <tr><td>To</td><td>{dest}</td></tr>
          </tbody>
        </table>
        {p.consent ? (
          <div className="snip-card is-consent">
            <div className="q">Needs your OK</div>
            <div className="snip-muted">{p.consent.summary}</div>
            <div className="row">
              <button type="button" className="snip-btn" data-weight="medium" onClick={() => p.onConsent(false)}>Deny</button>
              <button type="button" className="snip-btn primary" data-weight="heavy" onClick={() => p.onConsent(true)}>Send</button>
            </div>
          </div>
        ) : null}
        <div className="row">
          <button type="button" className="snip-btn" data-weight="medium" onClick={p.onCancel}>Cancel</button>
          <button type="button" className="snip-btn primary" data-weight="heavy" disabled={!p.aiOn || p.running} onClick={p.onTranslate}>
            {p.running ? "Translating…" : "Translate"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="snip-card" role="dialog" aria-label="Send to an app">
      <div className="q">Send to an app</div>
      <div className="snip-muted">Lens copies the image and brings the app forward. You paste it and press Send yourself.</div>
      {p.recent.filter((r) => r.kind === "app").length ? <div className="snip-muted">Recent</div> : null}
      <div className="snip-applist">
        {p.recent.filter((r) => r.kind === "app" && r.exe).map((r) => (
          <button key={r.id} type="button" className="snip-btn" data-weight="medium" onClick={() => p.onOpenIn(r.exe!)}>{r.label}</button>
        ))}
        {p.apps.length ? <div className="snip-muted snip-applist-label">Open now</div> : null}
        {p.apps.map((a) => (
          <button key={a.hwnd} type="button" className="snip-btn" data-weight="medium" onClick={() => p.onOpenIn(a.exe)}>
            {a.app} <span className="snip-muted snip-app-title">{a.title}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="snip-btn" data-weight="medium" onClick={p.onCancel}>Cancel</button>
      </div>
    </div>
  );
};
