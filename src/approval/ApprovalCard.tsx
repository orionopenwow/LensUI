import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ExternalLink, List, Lock, RotateCcw, ShieldAlert, Sparkles, Square } from "lucide-react";
import { DockStylePreview } from "../dock/DockStylePreview";
import { normalizeDockStyle } from "../dock/styles";
import {
  HOLD_MS,
  PRINCIPLES,
  TRUST_SPANS,
  canApproveSimilar,
  agoLabel,
  cardReducer,
  denyLabel,
  initialCard,
  lookDiff,
  lookTokens,
  needsHold,
  orderTaskList,
  primaryLabel,
  reversibilityLine,
  sessionGrantable,
  toneOf,
  type ApprovalPreview,
  type ApprovalRequest,
  type CardState,
  type HoldPref,
  type LookState,
  type TrustSpan,
} from "./model";
import "./ApprovalCard.css";

export interface ApprovalCardProps {
  request: ApprovalRequest;
  /** Resolve true when the action ran. A thrown error or false shows the failed state. */
  onApprove: () => Promise<boolean | void> | boolean | void;
  onDeny: () => void;
  /** "Allow for this session" for the request's Ask-first capabilities, then approve. */
  onAllowSession?: (capabilities: string[]) => Promise<void> | void;
  /** Undo after it ran (shown on the done state when the action is reversible). */
  onUndo?: () => void;
  /** "Review all N" on bulk deletes. */
  onReview?: () => void;
  /** "Show tab ↗" on click/form requests. */
  onShowTab?: () => void;
  /** "Approve similar actions for this task": trust the scope for `span`, then approve. */
  onApproveSimilar?: (span: TrustSpan) => Promise<void> | void;
  holdPref?: HoldPref;
  /** Smaller layout for Mini, the Dock popover and the voice HUD. */
  compact?: boolean;
  /** Freeze in a state (screenshots, tests). */
  initial?: Partial<CardState>;
  /** Open the "This task can" list. */
  tasksOpen?: boolean;
}

function useReducedMotion(): boolean {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const root = typeof document !== "undefined" ? document.documentElement.dataset.motion : "";
  return root === "reduce" || (root !== "full" && !!q?.matches);
}

/** Press-and-hold primary button (mouse, touch, Enter or Space). Plain press when no hold is needed. */
export const HoldButton: React.FC<{
  label: string;
  hold: boolean;
  progress: number;
  disabled?: boolean;
  onStart: () => void;
  onProgress: (p: number) => void;
  onCancel: () => void;
  onDone: () => void;
}> = ({ label, hold, progress, disabled, onStart, onProgress, onCancel, onDone }) => {
  const t0 = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    t0.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const tick = useCallback(() => {
    if (t0.current == null) return;
    const p = (performance.now() - t0.current) / HOLD_MS;
    if (p >= 1) {
      stop();
      onDone();
      return;
    }
    onProgress(p);
    raf.current = requestAnimationFrame(tick);
  }, [onDone, onProgress, stop]);
  const begin = () => {
    if (disabled) return;
    if (!hold) return onDone();
    if (t0.current != null) return;
    t0.current = performance.now();
    onStart();
    raf.current = requestAnimationFrame(tick);
  };
  const end = () => {
    if (t0.current != null) {
      stop();
      onCancel();
    }
  };
  return (
    <button
      type="button"
      className={`ap-btn ap-primary${hold ? " is-hold" : ""}`}
      disabled={disabled}
      aria-label={hold ? `Hold to ${label}` : label}
      onPointerDown={(e) => {
        if (e.button === 0) begin();
      }}
      onPointerUp={end}
      onPointerLeave={end}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.shiftKey && !e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") end();
      }}
      onClick={(e) => {
        // Pointer and keys are handled above; a synthetic click (screen readers) counts as a press.
        if (!hold && e.detail === 0) onDone();
      }}
    >
      {hold ? <span className="ap-fill" style={{ transform: `scaleX(${progress})` }} aria-hidden /> : null}
      <span className="ap-btn-label">{label}</span>
      <kbd className="ap-kbd" aria-hidden>
        {hold ? "HOLD" : "⏎"}
      </kbd>
    </button>
  );
};

/** One themed mini desktop: a window with the frame look and the Dock style. */
const MiniLook: React.FC<{ state: LookState; label: string }> = ({ state, label }) => (
  <figure className="ap-look" style={lookTokens(state) as React.CSSProperties}>
    <div className="ap-look-screen">
      {Number(state.dim ?? 0) > 0 ? <div className="ap-look-back" aria-hidden /> : null}
      <div className="ap-look-win" aria-hidden>
        <span className="ap-look-bar" />
        <span className="ap-look-line" />
        <span className="ap-look-line is-short" />
      </div>
      <div className="ap-look-dock">
        <DockStylePreview style={normalizeDockStyle(state.dockStyle ?? undefined)} />
      </div>
    </div>
    <figcaption>{label}</figcaption>
  </figure>
);

const Details: React.FC<{ rows: ApprovalPreview["details"] }> = ({ rows }) =>
  rows.length ? (
    <dl className="ap-details">
      {rows.map((d, i) => (
        <React.Fragment key={`${d.label}-${i}`}>
          <dt>{d.label}</dt>
          <dd>{d.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  ) : null;

const Reason: React.FC<{ p: ApprovalPreview }> = ({ p }) => (p.reason ? <p className="ap-reason">{p.reason}</p> : null);

/** The body under the question, one variant per kind. */
const Body: React.FC<{ p: ApprovalPreview; onShowTab?: () => void }> = ({ p, onShowTab }) => {
  switch (p.kind) {
    case "payment":
      return (
        <>
          <Reason p={p} />
          {p.payment ? (
            <p className="ap-money">
              <span className="ap-amount">{p.payment.amount}</span>
              <span className="ap-method">{p.payment.method}</span>
              {p.payment.note ? <span className="ap-method">· {p.payment.note}</span> : null}
            </p>
          ) : null}
          {p.payment?.warning ? (
            <p className="ap-warning">
              <AlertTriangle size={13} aria-hidden /> {p.payment.warning}
            </p>
          ) : null}
          <Details rows={p.details} />
        </>
      );
    case "send":
      return p.send ? (
        <div className="ap-send">
          <p className="ap-send-to">
            <span className="ap-to">TO</span> <b>{p.send.to}</b> · {p.send.app}
          </p>
          <p className="ap-send-msg">{p.send.message}</p>
        </div>
      ) : null;
    case "element":
      return (
        <>
          <Reason p={p} />
          {p.element ? (
            <div className="ap-site">
              {p.element.siteLabel ? (
                <p className="ap-site-bar">
                  <span className="ap-site-dot" aria-hidden /> {p.element.siteLabel}
                </p>
              ) : null}
              <img src={p.element.image} alt={p.element.label ? `What Lens will click: ${p.element.label}` : "What Lens will click"} />
            </div>
          ) : null}
          <p className="ap-capture">
            <Square size={11} aria-hidden />
            <span>I'll click this{p.element?.capturedAgo ? ` · captured ${p.element.capturedAgo}` : ""}</span>
            {onShowTab ? (
              <button type="button" className="ap-link ap-showtab" onClick={onShowTab}>
                Show tab <ExternalLink size={11} aria-hidden />
              </button>
            ) : null}
          </p>
          <Details rows={p.details} />
        </>
      );
    case "look":
      return (
        <>
          <Reason p={p} />
          {p.look ? (
            <div className="ap-preview ap-preview-look" aria-label={lookDiff(p.look.before, p.look.after).join("; ")}>
              <MiniLook state={p.look.before} label="Now" />
              <span className="ap-arrow" aria-hidden>
                →
              </span>
              <MiniLook state={p.look.after} label="After" />
            </div>
          ) : null}
          <Details rows={p.details} />
        </>
      );
    case "window":
      return (
        <>
          <Reason p={p} />
          {p.window ? (
            <div className="ap-preview ap-preview-window">
              {p.window.thumbnail ? (
                <img src={p.window.thumbnail} alt="" className="ap-thumb" />
              ) : (
                <div className="ap-thumb is-blank" aria-hidden>
                  <span className="ap-look-bar" />
                </div>
              )}
              <div className="ap-win-meta">
                <span className="ap-win-title">{p.window.title}</span>
                <span className="ap-win-app">{p.window.app}</span>
              </div>
            </div>
          ) : null}
          <Details rows={p.details} />
        </>
      );
    default:
      return (
        <>
          <Reason p={p} />
          <Details rows={p.details} />
        </>
      );
  }
};

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  request,
  onApprove,
  onDeny,
  onAllowSession,
  onUndo,
  onReview,
  onShowTab,
  onApproveSimilar,
  holdPref = "confirm",
  compact = false,
  initial,
  tasksOpen = false,
}) => {
  const p = request.preview;
  const [s, dispatch] = useReducer(cardReducer, { ...initialCard(false), ...initial });
  const reduce = useReducedMotion();
  const hold = needsHold(p, holdPref);
  const tasks = orderTaskList(p.taskList);
  const grantable = p.kind === "payment" || p.kind === "send" || p.kind === "delete" ? [] : sessionGrantable(p.taskList);
  const blocked = p.risk === "blocked";
  const busy = s.phase === "working";
  const closed = s.phase === "done" || s.phase === "denied" || s.phase === "failed";
  const tone = toneOf(p);
  const [span, setSpan] = useState<TrustSpan>("run");
  const similar = onApproveSimilar && canApproveSimilar(p) ? p.similar : undefined;
  const showReversible = !blocked && (p.kind === "look" || p.kind === "window" || p.kind === "settings" || p.kind === "none");

  const approve = useCallback(async () => {
    dispatch({ type: "approve" });
    try {
      const ok = await onApprove();
      dispatch({ type: "result", ok: ok !== false, message: ok === false ? "Lens couldn't do that." : undefined });
    } catch (e) {
      dispatch({ type: "result", ok: false, message: String(e ?? "Lens couldn't do that.") });
    }
  }, [onApprove]);

  const deny = useCallback(() => {
    dispatch({ type: "deny" });
    onDeny();
  }, [onDeny]);

  const approveSimilar = useCallback(async () => {
    if (!onApproveSimilar) return;
    await onApproveSimilar(span);
    await approve();
  }, [onApproveSimilar, span, approve]);

  const allowSession = useCallback(async () => {
    if (!onAllowSession) return;
    await onAllowSession(grantable);
    await approve();
  }, [onAllowSession, grantable, approve]);

  // Esc or Shift+Enter denies; Enter approves when no hold is needed.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (closed || busy || blocked) return;
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === "Escape" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      deny();
    } else if (e.key === "Enter" && !hold && tag !== "BUTTON" && tag !== "SUMMARY") {
      e.preventDefault();
      approve();
    }
  };

  const site = request.site ?? (request.origin === "browser" ? request.source : undefined);
  const title = closed ? (s.phase === "done" ? "Done" : s.phase === "denied" ? "Denied" : "Didn't work") : "Needs your OK";

  return (
    <section
      className={`ap-card${compact ? " is-compact" : ""}${reduce ? " is-still" : ""} kind-${p.kind} risk-${p.risk} phase-${s.phase}`}
      role="dialog"
      aria-labelledby={`ap-q-${request.id}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <header className="ap-head">
        <Sparkles size={13} className="ap-head-icon" aria-hidden />
        <span className="ap-head-title">{title}</span>
        <span className="ap-source">
          <span className={`ap-dot tone-${tone}`} aria-hidden />
          <span className="ap-source-name">{site ?? request.source}</span>
        </span>
        <button
          type="button"
          className="ap-icon-btn"
          aria-expanded={!s.collapsed}
          aria-label={s.collapsed ? "Show details" : "Hide details"}
          onClick={() => dispatch({ type: "toggle-collapse" })}
        >
          <ChevronDown size={13} className={s.collapsed ? "is-rot" : ""} />
        </button>
      </header>

      <h2 className="ap-question" id={`ap-q-${request.id}`}>
        {p.question}
      </h2>

      {!s.collapsed ? (
        <>
          <Body p={p} onShowTab={onShowTab} />

          {showReversible ? (
            <p className={`ap-reversible${p.reversible ? "" : " is-final"}`}>
              {p.reversible ? <RotateCcw size={12} aria-hidden /> : <ShieldAlert size={12} aria-hidden />}
              {reversibilityLine(p)}
              <span className="ap-when">· {agoLabel(request.createdMs)}</span>
            </p>
          ) : null}

          {tasks.length ? (
            <details className="ap-tasks" open={tasksOpen}>
              <summary>
                This task can <ChevronDown size={11} aria-hidden />
              </summary>
              <ul>
                {tasks.map((t) => {
                  const principle = t.principle ?? PRINCIPLES[t.id];
                  return (
                    <li key={t.id} className={`lvl-${t.level}${t.used ? " is-used" : ""}`}>
                      <span className="ap-task-icon" aria-hidden>
                        {t.level === "blocked" ? <Lock size={12} /> : t.level === "allowed" ? <Check size={12} /> : <span className="ap-ask-dot" />}
                      </span>
                      <span className="ap-task-text">
                        <span className="ap-task-label">{t.label}</span>
                        {principle ? <span className="ap-principle">{principle}</span> : null}
                      </span>
                      <span className="ap-task-level">{t.level === "ask" ? "Ask first" : t.level === "allowed" ? "Allowed" : "Never"}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      {similar && !closed && !s.collapsed ? (
        <div className="ap-similar">
          <button type="button" className="ap-link ap-similar-btn" disabled={busy} onClick={approveSimilar}>
            Approve similar actions for this task
          </button>
          <span className="ap-scope" aria-label={`Scope: ${similar.label}`}>
            {similar.label}
          </span>
          <select className="ap-span" value={span} aria-label="How long" onChange={(e) => setSpan(e.target.value as TrustSpan)}>
            {TRUST_SPANS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {s.message && closed ? <p className={`ap-message${s.phase === "failed" ? " is-bad" : ""}`}>{s.message}</p> : null}

      <footer className="ap-foot">
        {closed ? (
          s.phase === "done" && p.reversible && onUndo ? (
            <button type="button" className="ap-btn ap-secondary" onClick={onUndo}>
              <RotateCcw size={13} aria-hidden /> Undo
            </button>
          ) : null
        ) : blocked ? (
          <p className="ap-blocked">
            <Lock size={13} aria-hidden /> Lens never lets an AI do this.
          </p>
        ) : (
          <>
            {p.kind === "delete" && p.bulk && onReview ? (
              <button type="button" className="ap-link ap-review" onClick={onReview}>
                <List size={13} aria-hidden /> {p.bulk.reviewLabel ?? `Review all ${p.bulk.count.toLocaleString("en-US")}`}
              </button>
            ) : onAllowSession && grantable.length ? (
              <button type="button" className="ap-link" disabled={busy} onClick={allowSession}>
                Allow for this session
              </button>
            ) : null}
            <span className="ap-spacer" />
            <button type="button" className="ap-btn ap-secondary" disabled={busy} onClick={deny}>
              <span className="ap-btn-label">{denyLabel(p)}</span>
              <kbd className="ap-kbd" aria-hidden>
                ⇧⏎
              </kbd>
            </button>
            <HoldButton
              label={busy ? "Working…" : primaryLabel(p)}
              hold={hold}
              progress={s.progress}
              disabled={busy}
              onStart={() => dispatch({ type: "hold-start" })}
              onProgress={(x) => dispatch({ type: "hold-progress", p: x })}
              onCancel={() => dispatch({ type: "hold-cancel" })}
              onDone={approve}
            />
          </>
        )}
      </footer>
    </section>
  );
};

export default ApprovalCard;
