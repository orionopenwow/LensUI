import React, { useEffect } from "react";
import { ApprovalCard } from "./ApprovalCard";
import { allowForSession, approveMcp, denyMcp, trustSimilar, undoChange, usePendingApprovals } from "./api";
import "./ApprovalCard.css";
import { useLensState } from "../hooks/useLensState";

/**
 * The standalone topmost "Needs your OK" window for MCP requests that arrive while Lens is in the
 * background (window label `approval`, see docs/CLAUDE_CONTROL.md). Shows the oldest pending
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

  if (!first) return <main className="ap-window" />;
  return (
    <main className="ap-window">
      {requests.length > 1 ? <p className="ap-queue">{requests.length} requests waiting · oldest first</p> : null}
      <ApprovalCard
        key={first.id}
        request={first}
        onApprove={async () => {
          const ok = await approveMcp(first.id);
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
