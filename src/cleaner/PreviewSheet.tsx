// "Here's exactly what will happen": the dry run, shown before anything is touched. Your own
// files (Space map, Biggest files, Downloads review, REVIEW picks) go through the Lens approval
// card as a "Delete to Bin" request; a permanent delete needs a second, explicit confirmation.

import React, { useMemo, useState } from "react";
import { AlertTriangle, FileText, ListChecks, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { ApprovalCard } from "../approval/ApprovalCard";
import type { ApprovalRequest } from "../approval/model";
import "../approval/ApprovalCard.css";
import { fmtSize } from "./model";
import type { Preview } from "./types";
import { Key, Spinner } from "./ui";

function group(p: Preview) {
  const del = p.entries.filter((e) => e.action === "delete");
  const bin = p.entries.filter((e) => e.action === "recycle");
  return { del, bin, delSize: del.reduce((a, e) => a + e.size, 0), binSize: bin.reduce((a, e) => a + e.size, 0) };
}

export const PreviewSheet: React.FC<{
  preview: Preview;
  title: string;
  smart?: boolean;
  userFiles?: boolean;
  busy: boolean;
  onRun: (confirm?: string | null) => void;
  onClose: () => void;
  onFullList: () => void;
}> = ({ preview, title, smart, userFiles, busy, onRun, onClose, onFullList }) => {
  const g = group(preview);
  const [permanentOk, setPermanentOk] = useState(false);
  const permanent = !!preview.confirmToken;
  const extra = preview.entryCount - preview.entries.length;

  const request: ApprovalRequest = useMemo(
    () => ({
      id: preview.id,
      origin: "ai",
      source: "Lens Cleaner",
      createdMs: Date.now(),
      preview: {
        question: permanent ? `Delete ${preview.entryCount} item${preview.entryCount === 1 ? "" : "s"} for good?` : `Move ${preview.entryCount} item${preview.entryCount === 1 ? "" : "s"} to the Recycle Bin?`,
        reason: permanent ? "These won't be in the Recycle Bin. This can't be undone." : "You can restore them from the Recycle Bin, or with Undo right after.",
        verb: permanent ? "Delete for good" : "Move to Recycle Bin",
        kind: "delete",
        details: [
          { label: "Items", value: `${preview.entryCount} · ${fmtSize(preview.total)}` },
          { label: "Includes", value: preview.entries.slice(0, 3).map((e) => e.path.split(/[\\/]/).pop()).join(", ") + (preview.entryCount > 3 ? ", …" : "") },
          { label: "Recovery", value: permanent ? "None" : "Recycle Bin" },
        ],
        reversible: !permanent,
        risk: "confirm",
        holdToConfirm: permanent,
        capabilities: ["files.delete"],
        bulk: { count: preview.entryCount, reviewLabel: "See every file" },
        tone: permanent ? "danger" : "neutral",
        denyLabel: "Keep them",
      },
    }),
    [preview, permanent]
  );

  return (
    <div className="cl-sheet-scrim" role="presentation" onClick={onClose}>
      <div className="cl-sheet" role="dialog" aria-modal="true" aria-labelledby="cl-sheet-title" onClick={(e) => e.stopPropagation()}>
        <header className="cl-sheet-head">
          <span className="cl-sheet-icon" aria-hidden>
            <ListChecks size={18} />
          </span>
          <div>
            <h2 id="cl-sheet-title" className="cl-h3">
              {title}
            </h2>
            <p className="cl-meta">DRY RUN · NOTHING HAS BEEN TOUCHED YET</p>
          </div>
          <button type="button" className="cl-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {smart && (
          <p className="cl-smart-note">
            <ShieldCheck size={14} aria-hidden /> Smart Clean only includes items marked SAFE. Your files, games and anything that needs admin are never in it.
          </p>
        )}

        {preview.refused.length > 0 && (
          <div className="cl-refused" role="note">
            <AlertTriangle size={14} aria-hidden /> {preview.refused.length} item{preview.refused.length === 1 ? "" : "s"} left out: {preview.refused[0][1]}
          </div>
        )}

        <div className="cl-sheet-groups">
          {g.del.length > 0 && (
            <div className="cl-group">
              <div className="cl-group-head">
                <Trash2 size={14} aria-hidden /> <strong>Deleted</strong>
                <span className="cl-meta">{userFiles ? "your picks" : "caches and temporary files"}</span>
                <span className="cl-num">{fmtSize(g.delSize)}</span>
              </div>
              <ul className="cl-paths">
                {g.del.slice(0, 6).map((e) => (
                  <li key={e.path} className="cl-mono">
                    {e.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {g.bin.length > 0 && (
            <div className="cl-group">
              <div className="cl-group-head">
                <Undo2 size={14} aria-hidden /> <strong>To the Recycle Bin</strong>
                <span className="cl-meta">you can get these back</span>
                <span className="cl-num">{fmtSize(g.binSize)}</span>
              </div>
              <ul className="cl-paths">
                {g.bin.slice(0, 6).map((e) => (
                  <li key={e.path} className="cl-mono">
                    {e.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.steps.map((st) => (
            <div className="cl-group is-step" key={st.label}>
              <div className="cl-group-head">
                <ShieldCheck size={14} aria-hidden /> <strong>{st.label}</strong>
                <span className="cl-num">{st.size > 0 ? fmtSize(st.size) : ""}</span>
              </div>
            </div>
          ))}
          <button type="button" className="cl-link cl-full" onClick={onFullList}>
            <FileText size={13} aria-hidden /> See every file ({preview.entryCount.toLocaleString()}){extra > 0 ? "" : ""}
          </button>
        </div>

        {userFiles ? (
          <div className="cl-approval">
            {permanent && !permanentOk ? (
              <div className="cl-perm">
                <AlertTriangle size={16} aria-hidden />
                <span>Permanent delete skips the Recycle Bin. Lens can't bring these back.</span>
                <button type="button" className="cl-btn is-danger is-sm" onClick={() => setPermanentOk(true)}>
                  I understand
                </button>
              </div>
            ) : (
              <ApprovalCard
                request={request}
                onApprove={async () => {
                  onRun(preview.confirmToken ?? null);
                  return true;
                }}
                onDeny={onClose}
                onReview={onFullList}
                holdPref={permanent ? "always" : "confirm"}
              />
            )}
          </div>
        ) : (
          <footer className="cl-sheet-foot">
            <span className="cl-sel">
              <span className="cl-meta">WILL FREE</span>
              <span className="cl-num cl-strong">{fmtSize(preview.total)}</span>
            </span>
            <button type="button" className="cl-btn is-ghost" onClick={onClose} disabled={busy}>
              Not now <Key>Esc</Key>
            </button>
            <button type="button" className="cl-btn is-primary" onClick={() => onRun(null)} disabled={busy} autoFocus>
              {busy ? <Spinner /> : <Trash2 size={15} aria-hidden />} {busy ? "Cleaning…" : `Clean up ${fmtSize(preview.total)}`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};
