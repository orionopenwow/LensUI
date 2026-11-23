import React, { useCallback, useEffect, useReducer, useRef } from "react";
import { Check, ChevronDown, Lock, RotateCcw, ShieldAlert, Sparkles, X } from "lucide-react";
import { DockStylePreview } from "../dock/DockStylePreview";
import { normalizeDockStyle } from "../dock/styles";
import {
  HOLD_MS,
  agoLabel,
  cardReducer,
  initialCard,
  lookDiff,
  lookTokens,
  needsHold,
  orderTaskList,
  reversibilityLine,
  sessionGrantable,
  type ApprovalRequest,
  type CardState,
  type HoldPref,
  type LookState,
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
  holdPref?: HoldPref;
  /** Smaller layout for Mini, the Dock popover and the voice HUD. */
  compact?: boolean;
  /** Key hint on the primary button. */
  shortcut?: string;
  /** Freeze in a state (screenshots, tests). */
  initial?: Partial<CardState>;
}

function useReducedMotion(): boolean {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const root = typeof document !== "undefined" ? document.documentElement.dataset.motion : "";
  return root === "reduce" || (root !== "full" && !!q?.matches);
}

/** Press-and-hold primary button (mouse, touch, Enter or Space). Plain click when no hold is needed. */
export const HoldButton: React.FC<{
  label: string;
  hold: boolean;
  progress: number;
  disabled?: boolean;
  shortcut?: string;
  onStart: () => void;
  onProgress: (p: number) => void;
  onCancel: () => void;
  onDone: () => void;
}> = ({ label, hold, progress, disabled, shortcut, onStart, onProgress, onCancel, onDone }) => {
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
      className={`ap-primary${hold ? " is-hold" : ""}`}
      disabled={disabled}
      aria-label={hold ? `Hold to ${label.toLowerCase()}` : label}
      onPointerDown={(e) => {
        if (e.button === 0) begin();
      }}
      onPointerUp={end}
      onPointerLeave={end}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") end();
      }}
      onClick={(e) => {
        // Pointer and keys already handled; a synthetic click (screen readers) counts as a press.
        if (!hold && e.detail === 0) onDone();
      }}
    >
      {hold ? <span className="ap-fill" style={{ transform: `scaleX(${progress})` }} aria-hidden /> : null}
      <span className="ap-primary-label">{label}</span>
      {shortcut || hold ? <kbd className="ap-kbd">{hold ? "HOLD" : shortcut}</kbd> : null}
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

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  request,
  onApprove,
  onDeny,
  onAllowSession,
  onUndo,
  holdPref = "confirm",
  compact = false,
  shortcut = "Enter",
  initial,
}) => {
  const p = request.preview;
  const [s, dispatch] = useReducer(cardReducer, { ...initialCard(false), ...initial });
  const reduce = useReducedMotion();
  const hold = needsHold(p, holdPref);
  const tasks = orderTaskList(p.taskList);
  const grantable = sessionGrantable(p.taskList);
  const blocked = p.risk === "blocked";
  const busy = s.phase === "working";
  const closed = s.phase === "done" || s.phase === "denied" || s.phase === "failed";

  const approve = useCallback(async () => {
    dispatch({ type: "approve" });
    try {
      const ok = await onApprove();
      dispatch({ type: "result", ok: ok !== false, message: ok === false ? "Lens couldn't do that." : undefined });
    } catch (e) {
      dispatch({ type: "result", ok: false, message: String(e ?? "Lens couldn't do that.") });
    }
  }, [onApprove]);

  const allowSession = useCallback(async () => {
    if (!onAllowSession) return;
    await onAllowSession(grantable);
    await approve();
  }, [onAllowSession, grantable, approve]);

  // Esc denies while the card has focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !closed && !busy) {
      e.stopPropagation();
      dispatch({ type: "deny" });
      onDeny();
    }
  };

  const diff = p.look ? lookDiff(p.look.before, p.look.after) : [];
  const site = request.site ?? (request.origin === "browser" ? request.source : undefined);

  return (
    <section
      className={`ap-card${compact ? " is-compact" : ""}${reduce ? " is-still" : ""} risk-${p.risk} phase-${s.phase}`}
      role="dialog"
      aria-labelledby={`ap-q-${request.id}`}
      aria-describedby={`ap-r-${request.id}`}
      onKeyDown={onKeyDown}
    >
      <header className="ap-head">
        <Sparkles size={14} className="ap-head-icon" aria-hidden />
        <span className="ap-head-title">{closed ? (s.phase === "done" ? "Done" : s.phase === "denied" ? "Denied" : "Didn't work") : "Needs your OK"}</span>
        <span className="ap-source">
          <span className={`ap-dot origin-${request.origin}`} aria-hidden />
          <span className="ap-source-name">{site ?? request.source}</span>
        </span>
        <button
          type="button"
          className="ap-icon-btn"
          aria-expanded={!s.collapsed}
          aria-label={s.collapsed ? "Show details" : "Hide details"}
          onClick={() => dispatch({ type: "toggle-collapse" })}
        >
          <ChevronDown size={14} className={s.collapsed ? "is-rot" : ""} />
        </button>
      </header>

      <h2 className="ap-question" id={`ap-q-${request.id}`}>
        {p.question}
      </h2>
      {p.reason ? (
        <p className="ap-reason" id={`ap-r-${request.id}`}>
          {p.reason}
        </p>
      ) : null}

      {!s.collapsed ? (
        <>
          {p.kind === "look" && p.look ? (
            <div className="ap-preview ap-preview-look" aria-label={diff.join("; ")}>
              <MiniLook state={p.look.before} label="Now" />
              <span className="ap-arrow" aria-hidden>
                →
              </span>
              <MiniLook state={p.look.after} label="After" />
            </div>
          ) : null}
          {p.kind === "window" && p.window ? (
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
          {p.kind === "element" && p.element ? (
            <div className="ap-preview ap-preview-element">
              <img src={p.element.image} alt={p.element.label ? `What Lens will click: ${p.element.label}` : "What Lens will click"} />
              <p className="ap-capture">
                <span className="ap-capture-label">{p.element.label ? `I'll click “${p.element.label}”` : "I'll click this"}</span>
                {p.element.capturedAgo ? <span> · captured {p.element.capturedAgo}</span> : null}
              </p>
            </div>
          ) : null}

          {p.details.length ? (
            <dl className="ap-details">
              {p.details.map((d, i) => (
                <React.Fragment key={`${d.label}-${i}`}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}

          <p className={`ap-reversible${p.reversible ? "" : " is-final"}`}>
            {p.reversible ? <RotateCcw size={12} aria-hidden /> : <ShieldAlert size={12} aria-hidden />}
            {reversibilityLine(p)}
            <span className="ap-when">· {agoLabel(request.createdMs)}</span>
          </p>

          {tasks.length ? (
            <details className="ap-tasks" open={!compact}>
              <summary>This task can</summary>
              <ul>
                {tasks.map((t) => (
                  <li key={t.id} className={`lvl-${t.level}${t.used ? " is-used" : ""}`}>
                    <span className="ap-task-icon" aria-hidden>
                      {t.level === "blocked" ? <Lock size={12} /> : t.level === "allowed" ? <Check size={12} /> : <span className="ap-ask-dot" />}
                    </span>
                    <span className="ap-task-label">{t.label}</span>
                    <span className="ap-task-level">{t.level === "ask" ? "Ask first" : t.level === "allowed" ? "Allowed" : "Never"}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      {s.message && closed ? <p className={`ap-message${s.phase === "failed" ? " is-bad" : ""}`}>{s.message}</p> : null}

      <footer className="ap-foot">
        {closed ? (
          <>
            {s.phase === "done" && p.reversible && onUndo ? (
              <button type="button" className="ap-secondary" onClick={onUndo}>
                <RotateCcw size={14} aria-hidden /> Undo
              </button>
            ) : null}
          </>
        ) : blocked ? (
          <p className="ap-blocked">
            <Lock size={14} aria-hidden /> Lens never lets an AI do this.
          </p>
        ) : (
          <>
            {onAllowSession && grantable.length ? (
              <button type="button" className="ap-link" disabled={busy} onClick={allowSession}>
                Allow for this session
              </button>
            ) : null}
            <span className="ap-spacer" />
            <button
              type="button"
              className="ap-secondary"
              disabled={busy}
              onClick={() => {
                dispatch({ type: "deny" });
                onDeny();
              }}
            >
              <X size={14} aria-hidden /> Deny
            </button>
            <HoldButton
              label={busy ? "Working…" : p.verb}
              hold={hold}
              progress={s.progress}
              disabled={busy}
              shortcut={shortcut}
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
