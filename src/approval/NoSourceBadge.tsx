import React from "react";
import { EyeOff } from "lucide-react";
import type { NoAccess } from "./model";
import "./ApprovalCard.css";

/** Marks an answer that rests on no source: Lens couldn't (or wouldn't) read it. */
export const NoSourceBadge: React.FC = () => (
  <span className="ap-nosource" role="note">
    <EyeOff size={11} aria-hidden /> No source
  </span>
);

/** An honest "can't access that" answer card for the Command thread and the browser panel. */
export const NoAccessNote: React.FC<{ result: NoAccess; what?: string }> = ({ result, what }) => (
  <div className="ap-noaccess" role="status">
    <p>
      <b>I can't access {what ?? "that"}.</b> <NoSourceBadge />
    </p>
    <p className="ap-noaccess-reason">{result.reason}</p>
  </div>
);

export default NoSourceBadge;
