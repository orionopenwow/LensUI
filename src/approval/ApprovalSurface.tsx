import React, { useEffect, useState } from "react";
import { ApprovalCard } from "./ApprovalCard";
import { PlanCard } from "./PlanCard";
import { planFromRequests, stepFromRequest } from "./plan";
import { allowForSession, approveRequest, denyMcp, trustSimilar, undoChange, usePendingApprovals } from "./api";
import "./ApprovalCard.css";
import { useLensState } from "../hooks/useLensState";

/**
 * The standalone topmost "Needs your OK" window: MCP requests that arrive while Lens is in the
 * background, and anything Lens's own assistant, the bridge inbox or Lens Apps is waiting on (window label `approval`, see docs/CLAUDE_CONTROL.md). Shows the oldest pending
 * request; hides itself when the queue is empty.
 */
export const ApprovalSurface: React.FC = () => {
  // Theme tokens (data-scheme, pack colours) and live updates, like every other surface.
  useLensState();
  const { requests, refresh } = usePendingApprovals();
  const first = requests[requests.length - 1];

  useEffect(() => {
    if (requests.length > 0) return;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().hide())
      .catch(() => undefined);
  }, [requests.length]);

  // Several waiting steps of one assistant plan: one list with an Allow / Deny per step.
  const [answered, setAnswered] = useState<Record<string, "approved" | "denied">>({});
  const plan = planFromRequests(requests, first);

  if (!first) return <main className="ap-window" />;
  if (plan) {
    return (
      <main className="ap-window">
        <PlanCard
          key={plan.map((r) => r.id).join("|")}
          source={first.source}
          steps={plan.map((r, i) => stepFromRequest(r, i, answered[r.id]))}
          onDecide={async (id, approve) => {
            const req = plan.find((r) => r.id === id);
            if (!req) return;
            setAnswered((a) => ({ ...a, [id]: approve ? "approved" : "denied" }));
            // Each step is approved with its own token; a refused approval leaves it waiting.
            const ok = approve ? await approveRequest(req).catch(() => false) : (await denyMcp(id), true);
            if (!ok) setAnswered((a) => { const { [id]: _gone, ...rest } = a; return rest; });
            window.setTimeout(refresh, 600);
          }}
        />
      </main>
    );
  }
  return (
    <main className="ap-window">
      {requests.length > 1 ? <p className="ap-queue">{requests.length} requests waiting · oldest first</p> : null}
      <ApprovalCard
        key={first.id}
        request={first}
        onApprove={async () => {
          const ok = await approveRequest(first);
          window.setTimeout(refresh, 900);
          return ok;
        }}
        onDeny={() => {
          denyMcp(first.id).finally(() => window.setTimeout(refresh, 600));
        }}
        onAllowSession={(caps) => allowForSession(first.preview.source?.client ?? first.source, caps)}
        onApproveSimilar={async (span) => {
          if (first.preview.similar) await trustSimilar(first.preview.source?.client ?? first.source, first.preview.similar, span);
        }}
        onUndo={() => {
          undoChange().catch(() => undefined);
        }}
      />
    </main>
  );
};

export default ApprovalSurface;
