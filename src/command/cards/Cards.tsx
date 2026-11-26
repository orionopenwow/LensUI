// Thread cards. One visual family: a 3 px rail on the left says what kind of card it is;
// actions sit in a quiet row that appears on hover or focus.
import React from "react";
import {
  Archive, ArrowUpRight, Check, ClipboardPaste, Copy, Globe, LoaderCircle, Lock, RotateCcw,
  ShieldCheck, Sparkles, Square, TriangleAlert, X, Zap,
} from "lucide-react";
import type { ThreadItem, ContextChip } from "../thread";
import { Markdown } from "./Markdown";
import { ProposalApproval } from "../../approval/LocalApproval";
import { ReasonChips } from "../../agentsafe/ReasonChips";
import "./cards.css";

export interface CardHandlers {
  onCopy: (text: string) => void;
  onPaste: (text: string) => void;
  onToShelf: (text: string, title?: string) => void;
  onRetry: (key: string) => void;
  onStop: (key: string) => void;
  onTool: (callId: string, approve: boolean) => void;
  onBridge: (key: string, run: "summarise" | "ask-page" | "note" | "dismiss") => void;
  /** "Teach me": open Settings where the setting an action changed lives. */
  onShowSetting?: (target: string) => void;
}

const Btn = ({ icon: Icon, label, onClick, primary, kbd }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
  kbd?: string;
}) => (
  <button type="button" className={`ct-btn${primary ? " is-primary" : ""}`} onClick={onClick} aria-label={label}>
    <Icon size={14} strokeWidth={2} />
    <span>{label}</span>
    {kbd ? <kbd>{kbd}</kbd> : null}
  </button>
);

export function ChipRow({ chips }: { chips: ContextChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="ct-chips">
      {chips.map((c) => (
        <span key={c.key} className="ct-chip">
          {c.localOnly ? <Lock size={11} strokeWidth={2.2} /> : null}
          {c.label}
        </span>
      ))}
    </div>
  );
}

/** "Teach me": where the setting an applied action changed lives, with a link to it. */
const TeachLine = ({ where, onShow }: { where: { target: string; path: string }; onShow?: (target: string) => void }) => (
  <p className="ct-where" data-teach>
    <span>You can change this in {where.path}</span>
    {onShow ? (
      <button type="button" className="ct-where-link" onClick={() => onShow(where.target)}>
        Show me
      </button>
    ) : null}
  </p>
);

export function ThreadCard({ item, h, latest }: { item: ThreadItem; h: CardHandlers; latest: boolean }) {
  switch (item.kind) {
    case "user":
      return (
        <article className="ct ct-user" aria-label="You">
          <div className="ct-user-line">
            <p className="ct-user-text">{item.text}</p>
            <span className={`ct-dest is-${item.dest.toLowerCase()}`}>{item.dest === "Script" ? "Offline" : item.dest}</span>
          </div>
          {item.chips.length ? (
            <div className="ct-meta">
              <ChipRow chips={item.chips} />
            </div>
          ) : null}
        </article>
      );
    case "answer": {
      const busy = item.status === "streaming";
      return (
        <article className={`ct ct-answer is-${item.status}`} aria-live={busy ? "polite" : undefined} aria-busy={busy}>
          <header className="ct-head">
            <Sparkles size={13} strokeWidth={2.2} />
            <span className="ct-title">{item.provider ? item.provider : "Lens"}</span>
            {item.model ? <span className="ct-sub">{item.model}</span> : null}
            {item.tokens ? <span className="ct-sub">{item.tokens.in + item.tokens.out} tok</span> : null}
            {busy ? <LoaderCircle className="ct-spin" size={13} strokeWidth={2.2} aria-label="Answering" /> : null}
          </header>
          {item.text ? <Markdown text={item.text} /> : busy ? <p className="ct-wait">Thinking…</p> : null}
          {item.status === "error" ? (
            <p className="ct-error"><TriangleAlert size={13} strokeWidth={2.2} /> {item.error || "Something went wrong."}</p>
          ) : null}
          {item.status === "cancelled" ? <p className="ct-note">Stopped.</p> : null}
          <footer className={`ct-actions${latest ? " is-latest" : ""}`}>
            {busy ? (
              <Btn icon={Square} label="Stop" onClick={() => h.onStop(item.key)} kbd="Esc" />
            ) : (
              <>
                {item.text ? <Btn icon={ClipboardPaste} label="Paste" primary={latest} onClick={() => h.onPaste(item.text)} kbd={latest ? "Ctrl ↵" : undefined} /> : null}
                {item.text ? <Btn icon={Copy} label="Copy" onClick={() => h.onCopy(item.text)} /> : null}
                {item.text ? <Btn icon={Archive} label="To Shelf" onClick={() => h.onToShelf(item.text)} /> : null}
                <Btn icon={RotateCcw} label="Retry" onClick={() => h.onRetry(item.key)} />
              </>
            )}
          </footer>
        </article>
      );
    }
    case "tool": {
      const p = item.proposal;
      // A step that waits for the person is drawn by the one shared approval card (the same
      // request is on the pill and in the approval window through the shared queue).
      if (item.state === "pending" && p.risk === "confirm") {
        return (
          <article className="ct ct-tool ct-approval risk-confirm is-pending">
            <ProposalApproval proposal={p} onDecide={(ok) => h.onTool(p.call_id, ok)} />
          </article>
        );
      }
      return (
        <article className={`ct ct-tool risk-${p.risk} is-${item.state}`} aria-live="polite">
          <header className="ct-head">
            {p.risk === "blocked" ? <ShieldCheck size={13} strokeWidth={2.2} /> : <Zap size={13} strokeWidth={2.2} />}
            <span className="ct-title">{p.summary || p.tool}</span>
            <span className="ct-sub">{p.risk === "low" ? "Safe" : p.risk === "confirm" ? "Needs your OK" : "Blocked"}</span>
          </header>
          <dl className="ct-args">
            {Object.entries(p.args).slice(0, 4).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
              </React.Fragment>
            ))}
          </dl>
          {p.safety?.length ? <ReasonChips reasons={p.safety} /> : null}
          {item.state === "pending" ? (
            <footer className="ct-actions is-latest">
              <Btn icon={Check} label="Do it" primary onClick={() => h.onTool(p.call_id, true)} kbd="↵" />
              <Btn icon={X} label="Don't" onClick={() => h.onTool(p.call_id, false)} />
            </footer>
          ) : (
            <p className={`ct-note${item.state === "failed" ? " is-bad" : ""}`}>
              {item.message ??
                (item.state === "approved" ? "Running…" : item.state === "denied" ? "Not run." : item.state === "done" ? "Done." : "That didn't work.")}
            </p>
          )}
        </article>
      );
    }
    case "action":
      return (
        <article className={`ct ct-action${item.ok ? "" : " is-bad"}`} role="status" aria-live="polite">
          <p className="ct-line">
            {item.ok ? <Check size={13} strokeWidth={2.4} /> : <TriangleAlert size={13} strokeWidth={2.2} />}
            <span>{item.title}</span>
            {item.detail ? <span className="ct-sub">{item.detail}</span> : null}
          </p>
          {item.ok && item.where ? <TeachLine where={item.where} onShow={h.onShowSetting} /> : null}
        </article>
      );
    case "consent":
      return (
        <article className="ct ct-tool risk-confirm">
          <header className="ct-head">
            <ShieldCheck size={13} strokeWidth={2.2} />
            <span className="ct-title">Send to {item.dest}?</span>
          </header>
          <p className="ct-note">{item.fields.length ? `Includes: ${item.fields.join(", ")}.` : "Only what you typed."}</p>
        </article>
      );
    case "bridge": {
      const r = item.request;
      const host = (() => {
        try {
          return r.url ? new URL(r.url).host : "";
        } catch {
          return "";
        }
      })();
      return (
        <article className={`ct ct-bridge is-${item.state}`}>
          <header className="ct-head">
            <Globe size={13} strokeWidth={2.2} />
            <span className="ct-title">{r.title || host || "From your browser"}</span>
            {host ? <span className="ct-sub">{host}</span> : null}
            {r.url ? (
              <a className="ct-ext" href={r.url} target="_blank" rel="noreferrer" aria-label="Open page">
                <ArrowUpRight size={13} strokeWidth={2.2} />
              </a>
            ) : null}
          </header>
          {r.selection ? <blockquote className="ct-quote">{r.selection.slice(0, 400)}{r.selection.length > 400 ? "…" : ""}</blockquote> : null}
          {item.state === "new" ? (
            <footer className="ct-actions is-latest">
              <Btn icon={Sparkles} label="Summarise" primary={r.action !== "ask" && r.action !== "save"} onClick={() => h.onBridge(item.key, "summarise")} />
              <Btn icon={Sparkles} label="Ask about it" primary={r.action === "ask"} onClick={() => h.onBridge(item.key, "ask-page")} />
              <Btn icon={Archive} label="Save to Shelf" primary={r.action === "save"} onClick={() => h.onBridge(item.key, "note")} />
              <Btn icon={X} label="Dismiss" onClick={() => h.onBridge(item.key, "dismiss")} />
            </footer>
          ) : (
            <p className="ct-note">{item.state === "handled" ? "Added to the conversation." : "Dismissed."}</p>
          )}
        </article>
      );
    }
  }
}
