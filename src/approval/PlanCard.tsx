import React, { useEffect, useRef } from "react";
import { Ban, Check, Circle, ListChecks, Loader, ShieldAlert, X } from "lucide-react";
import { ReasonChips } from "../agentsafe/ReasonChips";
import { planTitle, stateLabel, stepAria, waitingSteps, type PlanStep } from "./plan";
import "./ApprovalCard.css";

export interface PlanCardProps {
  steps: PlanStep[];
  /** Who is asking ("Lens", a client name). */
  source?: string;
  /** Answer one step. Lens Core runs it only with that step's own token. */
  onDecide: (id: string, approve: boolean) => void | Promise<void>;
  compact?: boolean;
  /** Screenshots and tests: no entry animation. */
  still?: boolean;
}

const ICON: Record<PlanStep["state"], React.ReactNode> = {
  auto: <Circle size={12} aria-hidden />,
  waiting: <span className="ap-ask-dot" aria-hidden />,
  allowed: <Loader size={12} aria-hidden />,
  denied: <X size={13} aria-hidden />,
  done: <Check size={13} aria-hidden />,
  failed: <X size={13} aria-hidden />,
  blocked: <Ban size={12} aria-hidden />,
};

/**
 * "Needs your OK" for a plan: every step the agent proposed, in order, with what each one does
 * and an Allow / Deny on each step that waits. Steps that are safe run without asking; steps
 * Lens stopped say why. Esc denies what is still waiting.
 */
export const PlanCard: React.FC<PlanCardProps> = ({ steps, source = "Lens", onDecide, compact, still }) => {
  const root = useRef<HTMLDivElement>(null);
  const waiting = waitingSteps(steps);
  const total = steps.length;
  const firstWaiting = waiting[0]?.id;
  useEffect(() => {
    // Focus lands on the first decision, never on "Allow all".
    root.current?.querySelector<HTMLButtonElement>("[data-first-allow]")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const all = async (approve: boolean) => {
    for (const s of waiting) await onDecide(s.id, approve);
  };
  return (
    <div
      ref={root}
      className={`ap-card ap-plan${compact ? " is-compact" : ""}${still ? " is-still" : ""}`}
      role="group"
      aria-label={`Needs your OK: ${planTitle(steps)}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && waiting.length) {
          e.stopPropagation();
          void all(false);
        }
      }}
    >
      <header className="ap-head">
        <ListChecks size={14} className="ap-head-icon" aria-hidden />
        <span className="ap-head-title">{waiting.length ? "Needs your OK" : "Plan"}</span>
        <span className="ap-source"><span className="ap-dot" aria-hidden /><span className="ap-source-name">{source}</span></span>
      </header>
      <p className="ap-question">{planTitle(steps)}</p>
      <ol className="ap-plan-list">
        {steps.map((s) => (
          <li key={s.id} className={`ap-plan-step is-${s.state}`} aria-label={stepAria(s, total)}>
            <span className="ap-plan-n" aria-hidden>{s.index + 1}</span>
            <span className="ap-plan-body">
              <span className="ap-plan-what">{s.summary}</span>
              <span className="ap-plan-state"><span className="ap-plan-icon">{ICON[s.state]}</span>{stateLabel(s)}{s.note && (s.state === "failed" || s.state === "blocked") ? ` · ${s.note}` : ""}</span>
              {s.reasons.length ? <ReasonChips reasons={s.reasons} /> : null}
            </span>
            {s.state === "waiting" ? (
              <span className="ap-plan-actions">
                <button type="button" className="ap-btn ap-secondary ap-plan-btn" aria-label={`Deny step ${s.index + 1}: ${s.summary}`} onClick={() => void onDecide(s.id, false)}>Deny</button>
                <button type="button" className="ap-btn ap-primary ap-plan-btn" aria-label={`Allow step ${s.index + 1}: ${s.summary}`} data-first-allow={s.id === firstWaiting ? "" : undefined} onClick={() => void onDecide(s.id, true)}>Allow</button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {steps.some((s) => s.state === "blocked") ? (
        <p className="ap-blocked"><ShieldAlert size={14} aria-hidden /> Lens stopped a step for safety. The rest can still run.</p>
      ) : null}
      {waiting.length > 1 ? (
        <footer className="ap-foot">
          <button type="button" className="ap-btn ap-secondary" onClick={() => void all(false)}>
            <span className="ap-btn-label">Deny all</span>
            <kbd className="ap-kbd">Esc</kbd>
          </button>
          <span className="ap-spacer" />
          <button type="button" className="ap-btn ap-secondary" onClick={() => void all(true)}>
            <span className="ap-btn-label">Allow all {waiting.length}</span>
          </button>
        </footer>
      ) : null}
    </div>
  );
};

export default PlanCard;
