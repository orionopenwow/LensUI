import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FailsafeReport } from "../types/generated";
import { toast } from "../ui";

/**
 * Safety net card. Shows what Lens switched off to protect the desktop: Safe Mode, features
 * paused after repeated failures (with "Turn back on"), features held off by features.json,
 * settings that were repaired at start-up, and errors that were caught and contained.
 * Backend: src-tauri/src/failsafe (docs/FAILSAFE.md).
 */
export const FailsafeCard: React.FC = () => {
  const [report, setReport] = useState<FailsafeReport | null>(null);
  const [safeNext, setSafeNext] = useState(false);

  const refresh = useCallback(() => {
    invoke<FailsafeReport>("failsafe_status")
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("lens://failsafe-notice", refresh);
    return () => {
      unlisten.then((off) => off()).catch(() => {});
    };
  }, [refresh]);

  if (!report) return null;
  const { status } = report;
  const caught = status.caughtPanics.reduce((n, c) => n + c.count, 0);
  const heldOff = report.switches.filter((s) => s.off);
  const quiet = !status.safeMode && status.tripped.length === 0 && status.killed.length === 0 && status.configRepairs.length === 0 && caught === 0;

  const turnBackOn = (feature: string, label: string) => {
    invoke("failsafe_reset_feature", { feature })
      .then(() => {
        toast.success(`${label} is back on.`);
        refresh();
      })
      .catch((e) => toast.error(`Couldn't turn ${label} back on: ${String(e)}`));
  };

  const askSafeMode = (on: boolean) => {
    invoke("failsafe_safe_mode_next", { on })
      .then(() => {
        setSafeNext(on);
        toast(on ? "Lens will start in Safe Mode next time." : "Lens will start normally next time.");
      })
      .catch((e) => toast.error(`Couldn't change that: ${String(e)}`));
  };

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Safety net</div>
          <div className="cc-desc">
            {status.safeMode
              ? `Safe Mode is on: optional features are off until you restart Lens. Your settings are unchanged. ${status.safeReason}`
              : quiet
                ? "Nothing has been switched off. If part of Lens keeps failing, Lens pauses that part and tells you here."
                : "Lens switched something off to keep your desktop working. Details are below."}
          </div>
        </div>
        <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => askSafeMode(!safeNext)}>
          {safeNext ? "Cancel Safe Mode" : "Start in Safe Mode next time"}
        </button>
      </div>

      {status.tripped.map((t) => (
        <div className="cc-row" key={t.feature}>
          <div>
            <div className="cc-label">{t.label} is paused</div>
            <div className="cc-desc">It stopped answering several times in a row. Last problem: {t.error}</div>
          </div>
          <button data-weight="medium" type="button" className="cc-btn" onClick={() => turnBackOn(t.feature, t.label)}>
            Turn back on
          </button>
        </div>
      ))}

      {heldOff.length > 0 && !status.safeMode ? (
        <div className="cc-row">
          <div>
            <div className="cc-label">Held off by features.json</div>
            <div className="cc-desc">
              {heldOff.map((s) => s.label).join(", ")}. Remove them from features.json in the Lens data folder and restart Lens to use them again.
            </div>
          </div>
        </div>
      ) : null}

      {status.configRepairs.length > 0 ? (
        <div className="cc-row">
          <div>
            <div className="cc-label">Settings repaired at start-up</div>
            <div className="cc-desc">
              These could not be read and went back to their defaults: {status.configRepairs.slice(0, 6).join(", ")}
              {status.configRepairs.length > 6 ? ` and ${status.configRepairs.length - 6} more` : ""}. A copy of the old file is in the Lens data folder.
            </div>
          </div>
        </div>
      ) : null}

      {caught > 0 ? (
        <div className="cc-row">
          <div>
            <div className="cc-label">Errors contained</div>
            <div className="cc-desc">
              {caught} internal {caught === 1 ? "error was" : "errors were"} caught and passed over ({status.caughtPanics.map((c) => `${c.place} ×${c.count}`).join(", ")}). Crash reports has the details.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
