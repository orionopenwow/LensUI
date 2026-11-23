// The download tray: a small panel in the corner that shows the Get queue, and, after an install,
// a tidy setup checklist (Dock pin, right-click, voice…) with sensible defaults ticked. Nothing in
// the tray blocks browsing.
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { STAGE_LABEL, type Jobs } from "./jobs";
import { traySummary, type QueueItem, type QueueState } from "./queue";
import type { CatalogApp, RecipeStepView } from "./types";
import { AppIcon } from "./visuals";

/** Steps ticked by default: everything except switching Lens AI's model provider, which changes a
 *  setting the user may have chosen deliberately. */
export function defaultChosen(steps: RecipeStepView[]): number[] {
  return steps.filter((s) => s.kind !== "localModelProvider" && s.kind !== "mcpServer").map((s) => s.index);
}

function statusLine(item: QueueItem, jobs: Jobs): string {
  const j = jobs[item.appId];
  switch (item.status) {
    case "queued":
      return "Queued";
    case "running":
      return j ? `${STAGE_LABEL[j.stage]}${j.message ? ` · ${j.message}` : ""}` : "Starting…";
    case "verified":
      return "Verified · ready to run";
    case "done":
      return item.op === "uninstall" ? "Removed" : item.op === "upgrade" ? "Updated" : "Installed";
    case "failed":
      return item.message ?? "Didn't finish";
    case "cancelled":
      return "Cancelled";
  }
}

export interface TrayProps {
  queue: QueueState;
  jobs: Jobs;
  apps: Record<string, CatalogApp>;
  recipes: Record<string, RecipeStepView[] | undefined>;
  onCancel: (appId: string) => void;
  onRun: (appId: string) => void;
  onDismiss: (appId: string) => void;
  onApplySetup: (appId: string, chosen: number[]) => void;
  onSkipSetup: (appId: string) => void;
  defaultOpen?: boolean;
}

function Setup({ app, steps, onApply, onSkip }: { app: CatalogApp; steps: RecipeStepView[]; onApply: (c: number[]) => void; onSkip: () => void }) {
  const [chosen, setChosen] = useState<Set<number>>(new Set(defaultChosen(steps)));
  return (
    <div className="la-tray-setup">
      <div className="la-fine">Set up {app.name} with Lens</div>
      {steps.map((s) => (
        <label key={s.index} className="la-check">
          <input
            type="checkbox"
            checked={chosen.has(s.index)}
            onChange={(e) => {
              const n = new Set(chosen);
              e.target.checked ? n.add(s.index) : n.delete(s.index);
              setChosen(n);
            }}
          />
          <span>{s.description}</span>
        </label>
      ))}
      <div className="la-pop-actions">
        <button className="la-btn la-btn-sm" onClick={onSkip}>
          Skip
        </button>
        <button className="la-btn la-btn-sm la-btn-primary" disabled={!chosen.size} onClick={() => onApply([...chosen].sort((a, b) => a - b))}>
          Apply {chosen.size}
        </button>
      </div>
    </div>
  );
}

export function DownloadTray({ queue, jobs, apps, recipes, onCancel, onRun, onDismiss, onApplySetup, onSkipSetup, defaultOpen = true }: TrayProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!queue.items.length || typeof document === "undefined") return null;
  // Rendered on <body> so it stays in the window's corner while the catalogue scrolls.
  return createPortal(
    <section className="la-tray la-floating" aria-label="Downloads">
      <button className="la-tray-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="la-tray-title">Downloads</span>
        <span className="la-mono la-muted">{traySummary(queue)}</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <ul className="la-tray-list">
          {queue.items.map((item) => {
            const app = apps[item.appId];
            if (!app) return null;
            const j = jobs[item.appId];
            const live = item.status === "running" || item.status === "queued";
            return (
              <li key={item.appId} className={`la-tray-item la-tray-${item.status}`}>
                <div className="la-tray-row">
                  <AppIcon app={app} size={28} />
                  <div className="la-tray-text">
                    <span className="la-tray-name">{app.name}</span>
                    <span className="la-mono la-muted la-tray-status">{statusLine(item, jobs)}</span>
                    {item.status === "running" && (
                      <div className="la-bar la-bar-thin">
                        <span style={{ width: `${j?.overall ?? 3}%` }} />
                      </div>
                    )}
                  </div>
                  {item.status === "verified" && (
                    <button className="la-pill la-pill-run" onClick={() => onRun(item.appId)}>
                      Run
                    </button>
                  )}
                  {item.status === "done" && !item.setupPending && <Check size={14} className="la-ok" />}
                  {live || item.status === "verified" ? (
                    <button className="la-icon-btn" aria-label={`Cancel ${app.name}`} onClick={() => onCancel(item.appId)}>
                      <X size={13} />
                    </button>
                  ) : (
                    !item.setupPending && (
                      <button className="la-icon-btn" aria-label={`Dismiss ${app.name}`} onClick={() => onDismiss(item.appId)}>
                        <X size={13} />
                      </button>
                    )
                  )}
                </div>
                {item.setupPending && recipes[item.appId]?.length ? (
                  <Setup app={app} steps={recipes[item.appId]!} onApply={(c) => onApplySetup(item.appId, c)} onSkip={() => onSkipSetup(item.appId)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>,
    document.body,
  );
}
