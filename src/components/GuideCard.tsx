/** Control Center card: Guide, the built-in helper that teaches Lens, the browser and Windows with search, lessons and "Show me". Off until turned on; works offline; AI answers are optional. */
import React, { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { loadProgress, saveProgress } from "../guide/progress";
import { openGuide } from "../guide/coach";
import { EMPTY_PROGRESS, type GuideProgress } from "../guide/types";

export interface GuideCardProps {
  /** Total lessons in this build (shown as progress). */
  lessonCount?: number;
  /** Parity/testing. */
  initialProgress?: GuideProgress;
}

export const GuideCard: React.FC<GuideCardProps> = ({ lessonCount = 11, initialProgress }) => {
  const [p, setP] = useState<GuideProgress>(initialProgress ?? EMPTY_PROGRESS);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!initialProgress) loadProgress().then(setP).catch(() => {});
  }, [initialProgress]);

  const save = (patch: Partial<GuideProgress>) => {
    const next = { ...p, ...patch };
    setP(next);
    void saveProgress(next);
  };

  const done = p.completed.length;

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Guide</div>
          <div className="cc-desc">
            Ask "how do I…" and get the exact setting with a Show me button, or follow short interactive lessons. Works
            offline; nothing about what you use leaves this PC.
          </div>
        </div>
        <button data-weight="light"
          type="button"
          role="switch"
          aria-checked={p.enabled}
          aria-label="Guide"
          className={`cc-toggle ${p.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !p.enabled })}
        />
      </div>

      {p.enabled && (
        <>
          <div className="cc-row" style={{ marginTop: 12 }}>
            <div>
              <div className="cc-label">Tip of the day</div>
              <div className="cc-desc">One gentle tip a day about a feature you haven't tried. Never a pop-up.</div>
            </div>
            <button data-weight="light"
              type="button"
              role="switch"
              aria-checked={p.tipOfTheDay}
              aria-label="Tip of the day"
              className={`cc-toggle ${p.tipOfTheDay ? "on" : ""}`}
              onClick={() => save({ tipOfTheDay: !p.tipOfTheDay })}
            />
          </div>

          <div className="cc-row" style={{ marginTop: 12 }}>
            <div>
              <div className="cc-label">Lessons</div>
              <div className="cc-desc">
                {done} of {lessonCount} done. Answers use AI only when AI is on in AI &amp; Command, and only Lens's own help
                text is sent with your question.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flex: "none" }}>
              <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => void openGuide()}>
                <Compass size={13} strokeWidth={2.2} aria-hidden="true" style={{ marginRight: 4, verticalAlign: -2 }} />
                Open guide
              </button>
              {confirmReset ? (
                <button data-weight="medium"
                  type="button"
                  className="cc-btn-ghost"
                  onClick={() => {
                    save({ steps: {}, current: {}, completed: [], dismissedTips: [] });
                    setConfirmReset(false);
                  }}
                >
                  Confirm reset
                </button>
              ) : (
                <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => setConfirmReset(true)} disabled={!done && !Object.keys(p.steps).length}>
                  Reset progress
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GuideCard;
