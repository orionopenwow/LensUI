import React, { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { HoldButton } from "./HoldButton";
import { SourceDot } from "./FeedColumn";
import { charCount, composeLimit, sourceMeta, type SourceView } from "./model";

/** Composer: pick connected accounts that allow posting, write, then hand off to the approval card. */
export function Compose({ sources, initial = "", initialTargets, onReview, onClose }: {
  sources: SourceView[];
  initial?: string;
  initialTargets?: string[];
  onReview(text: string, targets: string[]): void;
  onClose?(): void;
}) {
  const postable = sources.filter((s) => s.enabled && s.connected && sourceMeta(s.kind).canPost);
  const [text, setText] = useState(initial);
  const [targets, setTargets] = useState<string[]>(initialTargets ?? postable.slice(0, 1).map((s) => s.id));
  const kinds = Object.fromEntries(sources.map((s) => [s.id, s.kind]));
  const limit = composeLimit(targets, kinds);
  const n = charCount(text);
  const over = n > limit;
  const toggle = (id: string) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  return (
    <div className="lf-compose" role="dialog" aria-label="New post">
      <div className="lf-compose-head">
        <span className="lf-h2">New post</span>
        <span className="lf-spacer" />
        {onClose ? <button data-weight="medium" className="lf-ico" aria-label="Close" onClick={onClose}><X size={14} /></button> : null}
      </div>
      {postable.length ? (
        <div className="lf-chips">
          {postable.map((s) => (
            <button data-weight="light" key={s.id} className={`lf-chip ${targets.includes(s.id) ? "" : "off"}`} aria-pressed={targets.includes(s.id)} onClick={() => toggle(s.id)}>
              <SourceDot source={s.kind} size={12} /> {s.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="lf-status">Connect Bluesky or Mastodon in Settings › Feeds to post. Reddit, GitHub, YouTube and X are read-only here.</div>
      )}
      <textarea className="lf-textarea" aria-label="Post text" value={text} placeholder="What's happening?" onChange={(e) => setText(e.target.value)} rows={4} />
      <div className="lf-compose-foot">
        <span className={`lf-count ${over ? "over" : ""}`}>{n}/{limit}</span>
        <span className="lf-spacer" />
        <button data-weight="heavy" className="lf-btn primary" disabled={!text.trim() || over || targets.length === 0} onClick={() => onReview(text, targets)}>Review</button>
      </div>
    </div>
  );
}

/** The approval card: shows exactly what will be posted and where. Nothing is sent until the
 *  user holds Post; the backend refuses any draft that wasn't approved this way. */
export function PostApproval({ text, targets, sources, verb = "Post", onApprove, onDeny, result }: {
  text: string;
  targets: string[];
  sources: SourceView[];
  verb?: "Post" | "Send";
  onApprove(): void;
  onDeny(): void;
  result?: { ok: boolean; message: string }[];
}) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return (
    <section className="lf-approve" role="alertdialog" aria-labelledby="lf-approve-title">
      <div className="lf-approve-head">
        <ShieldCheck size={15} />
        <span id="lf-approve-title">Needs your OK</span>
        <span className="lf-spacer" />
        <span className="lf-sub">Nothing sent in your name</span>
      </div>
      <div className="lf-approve-to">
        {targets.map((t) => {
          const s = byId.get(t);
          return (
            <span key={t} className="lf-chip">
              <SourceDot source={s?.kind ?? t} size={12} /> {s?.label ?? t}
            </span>
          );
        })}
      </div>
      <blockquote className="lf-approve-text">{text}</blockquote>
      {result ? (
        <div className="lf-approve-result">
          {result.map((r, i) => <div key={i} className={r.ok ? "ok" : "bad"}>{r.message}</div>)}
        </div>
      ) : (
        <div className="lf-approve-foot">
          <button data-weight="medium" className="lf-btn" onClick={onDeny}>Cancel</button>
          <HoldButton label={`Hold to ${verb.toLowerCase()}`} onDone={onApprove} className="primary" />
        </div>
      )}
    </section>
  );
}
