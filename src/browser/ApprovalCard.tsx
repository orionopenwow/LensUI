import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, CreditCard, Headphones, List, Lock, MousePointerClick, Shield, Trash2 } from "lucide-react";
import type { Capabilities } from "./api";
import { holdProgress, type PendingOk } from "./agent";
import { cardModel, type CardModel } from "./approvalShape";

export const HOLD_MS = 900;

/** Press-and-hold (pointer, or Enter/Space held). Returns progress 0–1 and the handlers. */
function useHold(onDone: () => void, enabled = true) {
  const [downAt, setDownAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const fired = useRef(false);
  useEffect(() => {
    if (downAt === null) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      if (holdProgress(downAt, Date.now(), HOLD_MS) >= 1) {
        if (!fired.current) {
          fired.current = true;
          setDownAt(null);
          onDone();
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [downAt, onDone]);
  const start = () => {
    if (!enabled) return;
    fired.current = false;
    setDownAt(Date.now());
  };
  const stop = () => setDownAt(null);
  return {
    progress: holdProgress(downAt, Date.now(), HOLD_MS),
    handlers: {
      onPointerDown: start,
      onPointerUp: stop,
      onPointerLeave: stop,
      onKeyDown: (e: React.KeyboardEvent) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) start();
      },
      onKeyUp: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") stop();
      },
    },
  };
}

/** Key chip shown on every button. */
export function Key({ k }: { k: string }) {
  return <span className="lb-key" aria-hidden>{k}</span>;
}

function Head({ m }: { m: CardModel }) {
  return (
    <header className="lb-ok-head">
      <span className="lb-ok-tag"><Shield size={13} /> Needs your OK</span>
      <span className="lb-mono lb-dim lb-push"><span className={`lb-dot ${m.variant === "payment" ? "is-green" : "is-red"}`} /> {m.site}</span>
      <ChevronDown size={13} className="lb-dim" aria-hidden />
    </header>
  );
}

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  if (!rows.length) return null;
  return (
    <dl className="lb-ok-details">
      {rows.map((f, i) => (
        <React.Fragment key={i}>
          <dt>{f.label}</dt>
          <dd>{f.value || "—"}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** "Needs your OK" in four variants (click, delete, payment, send), the same shapes the shared
 * approval card uses. Primary actions that can't be undone need a hold. */
export function ApprovalCard({ pending, onDeny, onApprove, now, model }: { pending: PendingOk; onDeny(): void; onApprove(): void; now?: number; model?: CardModel }) {
  const m = model ?? cardModel(pending, now ?? Date.now());
  const hold = useHold(onApprove, m.hold);
  const primaryProps = m.hold ? hold.handlers : { onClick: onApprove };
  return (
    <section className={`lb-ok lb-ok-${m.variant}`} role="alertdialog" aria-labelledby="lb-ok-title">
      <Head m={m} />
      <h2 id="lb-ok-title" className="lb-ok-title">{m.question}</h2>
      {m.variant !== "send" ? <p className="lb-ok-sub">{m.reason}</p> : null}

      {m.variant === "payment" ? (
        <div className="lb-ok-amount">
          <span className="lb-ok-money">{m.amount ?? "—"}</span>
          <span className="lb-mono lb-dim">{m.cardHint ?? "card on file"} · charged on approval</span>
        </div>
      ) : null}

      {m.variant === "send" ? (
        <div className="lb-ok-msg">
          <div className="lb-ok-to"><span className="lb-mono lb-dim">TO</span> <b>{m.recipient}</b></div>
          {m.message ? <p>{m.message}</p> : null}
        </div>
      ) : null}

      {m.variant === "click" && m.element ? (
        <>
          <div className="lb-ok-frame" aria-label="What I'll click">
            <div className="lb-ok-frame-bar">
              <span className="lb-dot is-red" />
              <span>{m.element.title.slice(0, 48) || m.site}</span>
              <span className="lb-push lb-ok-secure"><Lock size={11} /> Secure</span>
            </div>
            <div className="lb-ok-frame-body">
              {m.element.fields.length ? (
                <div className="lb-ok-fields">
                  {m.element.fields.map((f, i) => <span key={i} className="lb-ok-field">{f.value || f.label}</span>)}
                </div>
              ) : null}
              <span
                className="lb-ok-replica"
                style={{
                  background: m.element.look.bg && m.element.look.bg !== "rgba(0, 0, 0, 0)" ? m.element.look.bg : undefined,
                  color: m.element.look.fg || undefined,
                  borderRadius: m.element.look.radius || undefined,
                }}
              >
                {m.element.label}
              </span>
            </div>
          </div>
          <div className="lb-ok-caption lb-mono">
            <MousePointerClick size={12} /> I'll click this · captured {m.capturedAgo}
            <span className="lb-push">Show tab ↗</span>
          </div>
        </>
      ) : null}

      {m.variant !== "send" ? <Rows rows={m.details} /> : null}

      {m.warnings.length ? (
        <ul className="lb-ok-warn">
          {m.warnings.map((w, i) => <li key={i}><AlertTriangle size={12} /> {w}</li>)}
        </ul>
      ) : null}

      <footer className="lb-ok-actions">
        {m.review ? <span className="lb-ok-review lb-dim"><List size={12} /> {m.review}</span> : null}
        <span className="lb-push" />
        <button className="lb-btn lb-btn-sm" onClick={onDeny}>{m.deny} <Key k="Esc" /></button>
        <button className={`lb-btn lb-btn-sm lb-btn-primary${m.hold ? " lb-hold" : ""}`} {...primaryProps} aria-label={m.hold ? `Hold to ${m.verb}` : m.verb}>
          {m.hold ? <span className="lb-hold-fill" style={{ transform: `scaleX(${hold.progress})` }} aria-hidden /> : null}
          <span className="lb-hold-label">
            {m.variant === "payment" ? <CreditCard size={13} /> : m.variant === "delete" ? <Trash2 size={13} /> : null}
            {m.verb}
          </span>
          <Key k={m.hold ? "hold ⏎" : "⏎"} />
        </button>
      </footer>
    </section>
  );
}

/** One-line "Needs your OK" used at the bottom of a collapsed timeline. */
export function CompactOk({ title, meta, onOpen }: { title: string; meta: string; onOpen(): void }) {
  return (
    <button className="lb-ok-compact" onClick={onOpen}>
      <span className="lb-ok-tag"><Shield size={13} /> Needs your OK</span>
      <span className="lb-ok-compact-body">
        <span className="lb-ok-compact-icon"><Headphones size={16} /></span>
        <span className="lb-ok-compact-text">
          <b>{title}</b>
          <span className="lb-mono lb-dim">{meta}</span>
        </span>
      </span>
    </button>
  );
}

const CAP_ROWS: { key: keyof Capabilities | "logins"; label: string; note?: string }[] = [
  { key: "readPage", label: "Read this page" },
  { key: "search", label: "Search the web" },
  { key: "fillForms", label: "Fill in forms" },
  { key: "submit", label: "Submit, book or send", note: "Ask first" },
  { key: "payments", label: "Pay or buy" },
  { key: "logins", label: "Sign in or type passwords", note: "Never" },
];

function PaymentsRow({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  // Turning payments on needs a hold; turning them off is instant.
  const hold = useHold(() => onChange(true), !on);
  return (
    <div className="lb-can-row lb-can-pay">
      <span className={`lb-can-box${on ? " is-on" : ""}`} aria-hidden>{on ? <Check size={11} /> : null}</span>
      <span>Pay or buy</span>
      {on ? (
        <button className="lb-chip lb-push" onClick={() => onChange(false)}>Ask first · turn off <Key k="⏎" /></button>
      ) : (
        <button className="lb-chip lb-push lb-hold" {...hold.handlers} aria-label="Hold to let this task ask before paying">
          <span className="lb-hold-fill" style={{ transform: `scaleX(${hold.progress})` }} aria-hidden />
          <span className="lb-hold-label lb-never">Blocked</span>
          <Key k="hold" />
        </button>
      )}
    </div>
  );
}

/** The per-task "This task can" list. Collapsed to one summary line. Toggles only make the agent
 * stricter, except payments, which can be switched to "Ask first" with a hold (card numbers are
 * never typed either way). */
export function TaskCan({ caps, onChange, open: openInit = false }: { caps: Capabilities; onChange(c: Capabilities): void; open?: boolean }) {
  const [open, setOpen] = useState(openInit);
  const allowed = [caps.readPage && "read", caps.search && "search", caps.fillForms && "fill forms"].filter(Boolean).join(", ") || "nothing yet";
  return (
    <section className="lb-can" aria-label="This task can">
      <button className="lb-can-sum" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="lb-can-title">This task can</span>
        <span className="lb-dim lb-can-brief">
          {allowed}
          {caps.submit ? " · asks before submitting" : " · never submits"}
          {caps.payments ? " · asks before paying" : ""}
        </span>
      </button>
      {open
        ? CAP_ROWS.map((r) => {
            if (r.key === "payments") return <PaymentsRow key={r.key} on={caps.payments} onChange={(v) => onChange({ ...caps, payments: v })} />;
            const fixed = r.key === "logins";
            const on = fixed ? false : !!caps[r.key as keyof Capabilities];
            return (
              <label key={r.key} className={`lb-can-row${fixed ? " is-fixed" : ""}`}>
                <input type="checkbox" checked={on} disabled={fixed} onChange={(e) => !fixed && onChange({ ...caps, [r.key]: e.target.checked })} />
                <span className="lb-can-box" aria-hidden>{on ? <Check size={11} /> : null}</span>
                <span>{r.label}</span>
                {r.note ? <span className={`lb-mono lb-push ${fixed ? "lb-never" : "lb-dim"}`}>{r.note}</span> : null}
              </label>
            );
          })
        : null}
    </section>
  );
}
