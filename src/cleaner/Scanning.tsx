import React from "react";
import { Check, Search } from "lucide-react";
import { COPY, fmtSize } from "./model";
import { CountSize, Key, Spinner } from "./ui";

/** Live checklist: every row is laid out up front (skeleton → spinner → tick), so nothing moves. */
export const Scanning: React.FC<{
  checklist: [string, string][];
  done: Record<string, number>;
  found: number;
  onCancel: () => void;
}> = ({ checklist, done, found, onCancel }) => {
  const doneCount = Object.keys(done).length;
  return (
    <section className="cl-scan" aria-labelledby="cl-scan-title" aria-busy="true">
      <div className="cl-scan-orb" aria-hidden>
        <svg viewBox="0 0 120 120" className="cl-orb-ring">
          <circle cx="60" cy="60" r="52" className="track" />
          <circle cx="60" cy="60" r="52" className="arc" />
        </svg>
        <span className="cl-orb-icon">
          <Search size={30} strokeWidth={2.4} />
        </span>
      </div>
      <h1 id="cl-scan-title" className="cl-h2">
        {COPY.scanning}
      </h1>
      <p className="cl-sub" aria-live="polite">
        Found <CountSize bytes={found} className="cl-strong" duration={600} /> you can safely clean so far
      </p>
      <ul className="cl-checklist" aria-label={`${doneCount} of ${checklist.length} places checked`}>
        {checklist.map(([id, title], i) => {
          const state = id in done ? "done" : i <= doneCount ? "running" : "pending";
          return (
            <li key={id} className={`cl-ck is-${state}`} style={{ ["--i" as string]: i }}>
              <span className="cl-ck-mark" aria-hidden>
                {state === "done" ? <Check size={13} strokeWidth={3} /> : state === "running" ? <Spinner size={13} /> : null}
              </span>
              <span className="cl-ck-title">{title}</span>
              <span className="cl-ck-size cl-num">{state === "done" ? (done[id] > 0 ? fmtSize(done[id]) : "Nothing") : <span className="cl-skel w30" />}</span>
            </li>
          );
        })}
      </ul>
      <button data-weight="medium" type="button" className="cl-btn is-ghost" onClick={onCancel}>
        Stop <Key>Esc</Key>
      </button>
    </section>
  );
};
