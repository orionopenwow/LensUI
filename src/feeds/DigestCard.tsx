import React from "react";
import { Lock, Sparkles, X } from "lucide-react";
import { SourceDot } from "./FeedColumn";

export interface DigestView {
  status: "idle" | "running" | "done" | "error";
  text: string;
  hours: number;
  itemCount: number;
  /** Which provider produced it ("local", "claude"…). Local is the default. */
  provider?: string;
  sources: [string, string][];
  error?: string;
}

/** Renders "• point [n]" lines with tappable source refs. */
function lines(text: string): { body: string; refs: number[] }[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((l) => {
      const refs = [...l.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
      return { body: l.replace(/\s*\[\d{1,3}\]/g, ""), refs };
    });
}

export function DigestCard({ d, onClose, onOpenRef }: { d: DigestView; onClose?(): void; onOpenRef?(url: string): void }) {
  const local = !d.provider || d.provider === "local" || d.provider === "script";
  return (
    <div className="lf-digest" role="region" aria-label="AI digest">
      <div className="lf-digest-head">
        <Sparkles size={14} />
        <span>Last {d.hours} h · {d.itemCount} posts</span>
        <span className="lf-spacer" />
        <span className={`lf-badge ${local ? "local" : ""}`}>{local ? <><Lock size={10} /> On this PC</> : "Cloud (you allowed it)"}</span>
        {onClose ? <button className="lf-ico" aria-label="Close digest" onClick={onClose}><X size={13} /></button> : null}
      </div>
      {d.status === "running" && !d.text ? <div className="lf-skel"><i /><i /><i /></div> : null}
      {d.status === "error" ? <div className="lf-status">{d.error ?? "The digest couldn't run."}</div> : null}
      {d.text ? (
        <ul className="lf-digest-list">
          {lines(d.text).map((l, i) => (
            <li key={i}>
              {l.body}
              {l.refs.map((r) => {
                const s = d.sources[r - 1];
                return s ? (
                  <button key={r} className="lf-ref" aria-label={`Open source ${r}: ${s[0]}`} onClick={() => onOpenRef?.(s[1])}>
                    <SourceDot source={s[0].split(" · ")[0]} size={11} />
                  </button>
                ) : null;
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
