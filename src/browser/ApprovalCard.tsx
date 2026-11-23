import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Lock, MousePointerClick, Shield } from "lucide-react";
import type { Capabilities } from "./api";
import { approvalTitle, holdProgress, warnings, type PendingOk } from "./agent";

const HOLD_MS = 900;

/** "Needs your OK": what will be clicked (a faithful replica of the element, not a screenshot),
 * the form's details, any fee/irreversibility warnings, Deny, and hold-to-approve. */
export function ApprovalCard({ pending, onDeny, onApprove, now }: { pending: PendingOk; onDeny(): void; onApprove(): void; now?: number }) {
  const d = pending.desc;
  const [downAt, setDownAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fired = useRef(false);
  const ago = Math.max(0, Math.round(((now ?? Date.now()) - pending.capturedAt) / 1000));
  const prog = holdProgress(downAt, Date.now(), HOLD_MS);

  useEffect(() => {
    if (downAt === null) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      if (holdProgress(downAt, Date.now(), HOLD_MS) >= 1) {
        if (!fired.current) {
          fired.current = true;
          setDownAt(null);
          onApprove();
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [downAt, onApprove]);
  void tick;

  const start = () => {
    fired.current = false;
    setDownAt(Date.now());
  };
  const stop = () => setDownAt(null);
  const warn = warnings(d);
  const label = (d.target.text || d.target.label || "Continue").slice(0, 40);

  return (
    <section className="lb-ok" role="alertdialog" aria-labelledby="lb-ok-title">
      <header className="lb-ok-head">
        <span className="lb-ok-tag"><Shield size={14} /> Needs your OK</span>
        <span className="lb-mono lb-dim lb-push"><span className="lb-rec" /> {d.host.replace(/^www\./, "")}</span>
        <ChevronDown size={14} className="lb-dim" aria-hidden />
      </header>
      <h2 id="lb-ok-title" className="lb-ok-title">{approvalTitle(d, pending.decision)}</h2>
      <p className="lb-ok-sub">
        {pending.decision.reason}
      </p>

      <div className="lb-ok-frame" aria-label="What I'll click">
        <div className="lb-ok-frame-bar">
          <span className="lb-rec" />
          <span>{d.title.slice(0, 48) || d.host}</span>
          <span className="lb-push lb-ok-secure"><Lock size={11} /> Secure</span>
        </div>
        <div className="lb-ok-frame-body">
          {d.fields.length ? (
            <div className="lb-ok-fields">
              {d.fields.slice(0, 3).map((f, i) => (
                <span key={i} className="lb-ok-field">{f.value || f.label}</span>
              ))}
            </div>
          ) : null}
          <span
            className="lb-ok-replica"
            style={{ background: d.look.bg && d.look.bg !== "rgba(0, 0, 0, 0)" ? d.look.bg : undefined, color: d.look.fg || undefined, borderRadius: d.look.radius || undefined }}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="lb-ok-caption lb-mono">
        <MousePointerClick size={12} /> I'll click this · captured {ago}s ago
      </div>

      {d.fields.length ? (
        <dl className="lb-ok-details">
          {d.fields.slice(0, 6).map((f, i) => (
            <React.Fragment key={i}>
              <dt>{f.label}</dt>
              <dd>{f.value || "—"}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {warn.length ? (
        <ul className="lb-ok-warn">
          {warn.map((w, i) => (
            <li key={i}><AlertTriangle size={12} /> {w}</li>
          ))}
        </ul>
      ) : null}

      <footer className="lb-ok-actions">
        <button className="lb-btn" onClick={onDeny}>Deny</button>
        <button
          className="lb-btn lb-btn-primary lb-hold"
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={stop}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && downAt === null && !e.repeat) start(); }}
          onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
          aria-label={`Hold to approve: ${label}`}
        >
          <span className="lb-hold-fill" style={{ transform: `scaleX(${prog})` }} aria-hidden />
          <span className="lb-hold-label">{label}</span>
          <span className="lb-kbd">HOLD</span>
        </button>
      </footer>
    </section>
  );
}

const CAP_ROWS: { key: keyof Capabilities | "payments" | "logins"; label: string; note?: string; fixed?: boolean }[] = [
  { key: "readPage", label: "Read this page" },
  { key: "search", label: "Search the web" },
  { key: "fillForms", label: "Fill in forms" },
  { key: "submit", label: "Submit, book or send", note: "Ask first" },
  { key: "payments", label: "Pay or buy", note: "Never", fixed: true },
  { key: "logins", label: "Sign in or type passwords", note: "Never", fixed: true },
];

/** The per-task "This task can" list. Collapsed to one summary line; toggles only make the
 * agent stricter, and paying / signing in can never be switched on. */
export function TaskCan({ caps, onChange, open: openInit = false }: { caps: Capabilities; onChange(c: Capabilities): void; open?: boolean }) {
  const [open, setOpen] = useState(openInit);
  const allowed = [caps.readPage && "read", caps.search && "search", caps.fillForms && "fill forms"].filter(Boolean).join(", ") || "nothing yet";
  return (
    <section className="lb-can" aria-label="This task can">
      <button className="lb-can-sum" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="lb-can-title">This task can</span>
        <span className="lb-dim lb-can-brief">{allowed}{caps.submit ? " · asks before submitting" : " · never submits"}</span>
      </button>
      {open
        ? CAP_ROWS.map((r) => {
            const on = r.fixed ? false : !!caps[r.key as keyof Capabilities];
            return (
              <label key={r.key} className={`lb-can-row${r.fixed ? " is-fixed" : ""}`}>
                <input type="checkbox" checked={on} disabled={r.fixed} onChange={(e) => !r.fixed && onChange({ ...caps, [r.key]: e.target.checked })} />
                <span className="lb-can-box" aria-hidden>{on ? <Check size={11} /> : null}</span>
                <span>{r.label}</span>
                {r.note ? <span className={`lb-mono lb-push ${r.fixed ? "lb-never" : "lb-dim"}`}>{r.note}</span> : null}
              </label>
            );
          })
        : null}
    </section>
  );
}
