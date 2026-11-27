import React, { useState } from "react";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { AppGlyph } from "./Inbox";
import { capability, type Conversation } from "./model";
import { PostApproval } from "../feeds/Compose";

export interface Line {
  who: string;
  text: string;
  ts: number;
  me?: boolean;
}

/** An open conversation. Only Matrix rooms show lines and a reply box (official API); every
 *  other messenger shows its badge and an Open button into its own web-app space. */
export function ConversationView({ c, lines = [], catchUp, onBack, onOpenApp, onCatchUp, onReview, pending, onApprove, onDeny }: {
  c: Conversation;
  lines?: Line[];
  catchUp?: string | null;
  onBack?(): void;
  onOpenApp?(c: Conversation): void;
  onCatchUp?(c: Conversation): void;
  onReview?(text: string): void;
  pending?: { text: string; result?: { ok: boolean; message: string }[] } | null;
  onApprove?(): void;
  onDeny?(): void;
}) {
  const [text, setText] = useState("");
  return (
    <section className="lm-conv" aria-label={c.title}>
      <header className="lf-head">
        {onBack ? <button data-weight="medium" className="lf-ico" aria-label="Back" onClick={onBack}><ArrowLeft size={15} /></button> : null}
        <AppGlyph app={c.app} title={c.title} size={24} />
        <span className="lm-conv-title">
          <span className="lf-h2">{c.title}</span>
          <span className="lf-sub">{capability(c)}</span>
        </span>
        <span className="lf-spacer" />
        <button data-weight="medium" className="lf-ico" aria-label="AI catch-up" onClick={() => onCatchUp?.(c)}><Sparkles size={15} /></button>
        <button data-weight="medium" className="lf-ico" aria-label={`Open ${c.title}`} onClick={() => onOpenApp?.(c)}><ExternalLink size={15} /></button>
      </header>
      {catchUp ? (
        <div className="lf-digest">
          <div className="lf-digest-head"><Sparkles size={13} /> <span>Catch-up</span></div>
          <ul className="lf-digest-list">{catchUp.split(/\n+/).filter(Boolean).slice(0, 5).map((l, i) => <li key={i}>{l.replace(/^\s*[-•*]\s*/, "")}</li>)}</ul>
        </div>
      ) : null}
      <div className="lf-list lm-lines">
        {lines.length ? (
          lines.map((l, i) => (
            <div key={i} className={`lm-line ${l.me ? "me" : ""}`}>
              {!l.me ? <span className="lm-who">{l.who}</span> : null}
              <span className="lm-bubble">{l.text}</span>
            </div>
          ))
        ) : (
          <div className="lf-empty">
            {c.canReply ? "No recent messages." : `${c.unread ? `${c.unread} unread. ` : ""}Read and reply in ${c.title} — Lens keeps it in its own space and only shows the badge.`}
            {!c.canReply ? <div style={{ marginTop: 10 }}><button data-weight="heavy" className="lf-btn primary" onClick={() => onOpenApp?.(c)}>Open {c.title}</button></div> : null}
          </div>
        )}
      </div>
      {pending && onApprove && onDeny ? (
        <PostApproval text={pending.text} targets={[c.title]} sources={[]} verb="Send" onApprove={onApprove} onDeny={onDeny} result={pending.result} />
      ) : c.canReply ? (
        <form
          className="lm-reply"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              onReview?.(text);
              setText("");
            }
          }}
        >
          <input aria-label="Reply" placeholder={`Reply in ${c.title}`} value={text} onChange={(e) => setText(e.target.value)} />
          <button data-weight="heavy" className="lf-btn primary" disabled={!text.trim()}>Review</button>
        </form>
      ) : null}
    </section>
  );
}
