/**
 * "What was I doing?" chips: open windows grouped into activities (Coding 3 · Browsing 5 · Talking 1).
 * Clicking a chip lists its windows; "Summarise" asks AI for a short recap. Window titles are only sent
 * to a local or script provider, or to the cloud when privacy is set to allow it (canSendTitles).
 *
 * DockSurface / widget integration: docs/AI_SURFACES.md §3d.
 */
import React, { useMemo, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import type { AiContext, AiPrivacy, AiProviderInfo } from "../../ai/surfaceApi";
import { canSendTitles, groupWindows, summaryPrompt, type WinLite } from "./activityGroups";
import "./aiDock.css";

export interface WindowGroupsProps {
  windows: WinLite[];
  provider?: AiProviderInfo | null;
  privacy: AiPrivacy;
  onFocusWindow: (hwnd: number) => void;
  onAsk: (prompt: string, context: AiContext) => void;
}

export const WindowGroups: React.FC<WindowGroupsProps> = ({ windows, provider, privacy, onFocusWindow, onAsk }) => {
  const groups = useMemo(() => groupWindows(windows), [windows]);
  const [open, setOpen] = useState<string | null>(null);
  const allowed = canSendTitles(provider, privacy);
  if (!groups.length) return null;
  const openGroup = groups.find((g) => g.activity === open);

  return (
    <div className="ai-groups" role="group" aria-label="What you're doing">
      <div className="ai-groups-row">
        {groups.map((g) => (
          <button
            key={g.activity}
            type="button"
            className={`ai-group-chip act-${g.activity} ${open === g.activity ? "is-open" : ""}`}
            aria-expanded={open === g.activity}
            onClick={() => setOpen((o) => (o === g.activity ? null : g.activity))}
          >
            <span className="ai-group-dot" aria-hidden="true" />
            {g.label}
            <span className="ai-group-n">{g.windows.length}</span>
          </button>
        ))}
        <button
          type="button"
          className="ai-group-chip is-ask"
          disabled={!allowed}
          aria-describedby={!allowed ? "ai-groups-why" : undefined}
          onClick={() => {
            const p = summaryPrompt(groups);
            onAsk(p.prompt, { page_text: p.page_text });
          }}
        >
          {allowed ? <Sparkles size={12} strokeWidth={2.4} aria-hidden="true" /> : <Lock size={12} strokeWidth={2.4} aria-hidden="true" />}
          Summarise
        </button>
      </div>
      {!allowed && (
        <div id="ai-groups-why" className="ai-groups-why">
          Window titles stay on this PC. Use a local model or the script helper to summarise them.
        </div>
      )}
      {openGroup && (
        <ul className="ai-group-list">
          {openGroup.windows.map((w) => (
            <li key={w.hwnd}>
              <button type="button" onClick={() => onFocusWindow(w.hwnd)} className={w.isFocused ? "is-focused" : ""}>
                {w.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
