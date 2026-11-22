/**
 * A quiet slot in the Dock with 1–3 apps you're likely to open now. Uses the local predictor in
 * predict.ts (no AI model, nothing leaves the PC). Off by default. Hover or focus shows why.
 *
 * DockSurface integration: docs/AI_SURFACES.md §3b.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AppWindow } from "lucide-react";
import { loadModel, recordLaunch, saveModel, suggest, type PredictModel, type Suggestion } from "./predict";
import "./aiDock.css";

/** Call this wherever the Dock launches an app (pinned, running, search result). */
export function recordDockLaunch(app: { key: string; name: string; path: string }, at = new Date()) {
  saveModel(recordLaunch(loadModel(), app, at));
}

export interface SuggestedAppsProps {
  enabled: boolean;
  /** Keys (lower-cased paths) already shown in the Dock, so suggestions are always new. */
  exclude: string[];
  iconFor?: (path: string) => string | null | undefined;
  onLaunch: (s: Suggestion) => void;
  limit?: 1 | 2 | 3;
  /** For tests and the parity harness. */
  model?: PredictModel;
  now?: Date;
}

export const SuggestedApps: React.FC<SuggestedAppsProps> = ({ enabled, exclude, iconFor, onLaunch, limit = 2, model, now }) => {
  const [tick, setTick] = useState(0);
  // Re-rank every 10 minutes so the slot follows the time of day.
  useEffect(() => {
    if (!enabled || now) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 600_000);
    return () => window.clearInterval(t);
  }, [enabled, now]);

  const items = useMemo(
    () => (enabled ? suggest(model ?? loadModel(), now ?? new Date(), { limit, exclude }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, model, now, limit, exclude.join("|"), tick]
  );
  if (!items.length) return null;

  return (
    <div className="ai-suggested" role="group" aria-label="Suggested apps">
      <span className="ai-suggested-rule" aria-hidden="true" />
      {items.map((s) => {
        const icon = iconFor?.(s.path);
        return (
          <button
            key={s.key}
            type="button"
            className="ai-suggested-app"
            aria-label={`${s.name}. Suggested: ${s.why}`}
            onClick={() => {
              recordDockLaunch({ key: s.key, name: s.name, path: s.path });
              onLaunch(s);
            }}
          >
            {icon ? <img src={icon} alt="" draggable={false} /> : <AppWindow size={20} strokeWidth={2} aria-hidden="true" />}
            <span className="ai-suggested-tip" role="tooltip">
              <strong>{s.name}</strong>
              <span>{s.why}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
