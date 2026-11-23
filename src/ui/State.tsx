import React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "./Button";
import "./ui.css";

/**
 * Empty state: one sentence on what goes here and one action. No sad illustrations.
 * Copy rule (AAA_RESEARCH §2.6): title says what this is, body says how it fills up.
 */
export const EmptyState: React.FC<{
  title: string;
  body?: React.ReactNode;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  className?: string;
}> = ({ title, body, icon, action, compact, className }) => (
  <div className={`lens-state is-empty ${compact ? "is-compact" : ""} ${className ?? ""}`} data-state="empty">
    <span className="lens-state-icon" aria-hidden>
      {icon ?? <Inbox size={16} />}
    </span>
    <div>
      <div className="lens-state-title">{title}</div>
      {body && <div className="lens-state-body">{body}</div>}
      {action && (
        <div className="lens-state-actions">
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  </div>
);

/** Error state: what happened, why (if known), and a way out ("Try again"). role=alert. */
export const ErrorState: React.FC<{
  title: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  className?: string;
}> = ({ title, detail, onRetry, retryLabel = "Try again", compact, className }) => (
  <div className={`lens-state is-error ${compact ? "is-compact" : ""} ${className ?? ""}`} role="alert" data-state="error">
    <span className="lens-state-icon" aria-hidden>
      <AlertTriangle size={16} />
    </span>
    <div>
      <div className="lens-state-title">{title}</div>
      {detail && <div className="lens-state-body">{detail}</div>}
      {onRetry && (
        <div className="lens-state-actions">
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  </div>
);
