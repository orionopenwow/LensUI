// The shared approval card for confirmations raised inside Lens: the assistant's steps (Lens
// Command, the AI dock, voice) and Lens Apps. Each of them also sits in the shared queue
// (win_mcp::enqueue_local), so the same request shows on the pill and in the approval window, and
// answering it in one place settles it everywhere.
import { rememberStepToken } from "../ai/stepTokens";
import React, { useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { ApprovalCard } from "./ApprovalCard";
import { closeLocalApproval, localRecord, openLocalApproval, usePendingApprovals } from "./api";
import { requestForProposal, type ApprovalPreview, type SafetyReasonLike } from "./model";

export interface ProposalLike {
  call_id: string;
  tool: string;
  args?: Record<string, unknown>;
  summary: string;
  risk: string;
  safety?: SafetyReasonLike[];
  /** The step's one-time approval token from the proposal event. */
  approval_token?: string;
}

/**
 * A step the assistant proposed that waits for the person. Draws the shared card from the queue
 * record (which carries the full preview) or, until that arrives, from the proposal itself.
 * `onDecide` is the surface's own answer path (`ai_confirm_tool`); the backend closes the queue
 * record when the step settles.
 */
export const ProposalApproval: React.FC<{ proposal: ProposalLike; onDecide: (approve: boolean) => void | Promise<void>; compact?: boolean }> = ({
  proposal,
  onDecide,
  compact = true,
}) => {
  const { requests } = usePendingApprovals();
  const fallback = useMemo(() => requestForProposal(proposal), [proposal]);
  const queued = requests.find((r) => r.reference === proposal.call_id);
  // Keep the proposal's own reasons if the queue record somehow lacks them.
  const request = queued
    ? { ...queued, preview: { ...queued.preview, safetyReasons: queued.preview.safetyReasons ?? fallback.preview.safetyReasons } }
    : fallback;
  return (
    <ApprovalCard
      key={proposal.call_id}
      request={request}
      compact={compact}
      onApprove={async () => {
        // The surface's answer path sends the token Core issued for this exact step.
        rememberStepToken(proposal.call_id, request.token ?? proposal.approval_token);
        await onDecide(true);
        return true;
      }}
      onDeny={() => {
        void onDecide(false);
      }}
    />
  );
};

/**
 * Puts a confirmation this surface is showing itself (a Lens Apps popover) on the shared card as
 * well, and reports an answer given there. Pass `reference: null` while nothing is being asked.
 * Call the returned `settle` when the person answers in the surface's own UI.
 */
export function useLocalApproval(opts: {
  reference: string | null;
  tool: string;
  text: string;
  source: string;
  preview: ApprovalPreview | null;
  onApprove: () => void;
  onDeny: () => void;
}): (ok: boolean, message?: string) => void {
  const { reference, tool, text, source, preview } = opts;
  const handlers = useRef(opts);
  handlers.current = opts;
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (!reference || !preview) return;
    settled.current = null;
    let alive = true;
    void openLocalApproval(reference, tool, text, source, preview);
    const check = () => {
      localRecord(reference)
        .then((rec) => {
          if (!alive || !rec || settled.current === reference) return;
          if (rec.status === "approved") {
            settled.current = reference;
            handlers.current.onApprove();
            void closeLocalApproval(reference, true);
          } else if (rec.status === "declined") {
            settled.current = reference;
            handlers.current.onDeny();
          }
        })
        .catch(() => undefined);
    };
    const un = listen("lens://mcp-changed", check);
    un.catch(() => undefined);
    return () => {
      alive = false;
      un.then((f) => f()).catch(() => undefined);
      // Closed here without an answer (Esc, clicked away, unmounted): take it off the shared card.
      if (settled.current !== reference) void closeLocalApproval(reference, false, "Closed.");
    };
    // The preview is rebuilt on every render; the reference identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  return (ok: boolean, message?: string) => {
    if (!reference || settled.current === reference) return;
    settled.current = reference;
    void closeLocalApproval(reference, ok, message);
  };
}
