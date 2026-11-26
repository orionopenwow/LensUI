import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ChangeInfo, FailsafeReport, SafetyFacts } from "../types/generated";
import { openSettingsAt } from "../update/useLensUpdate";
import { FALLBACK_FACTS, SAFETY_LINKS, changeGroups, changesLine, neverTouchedLine, safeModeLine, signInLine } from "../safety/model";
import "../safety/safety.css";

/**
 * Settings › About & Testing › Safety. One card for trust you can see: what Lens changes on this
 * PC (the change registry), what it never touches, the keys that always reach Windows, Safe Mode,
 * the Shift-at-sign-in skip, and the two ways out: Report a problem and Remove all.
 * Everything shown is read from the code that enforces it (src/safety/model.ts).
 */
export const SafetyCard: React.FC<{ demo?: { manifest: ChangeInfo[]; report: FailsafeReport | null; facts: SafetyFacts } }> = ({ demo }) => {
  const [manifest, setManifest] = useState<ChangeInfo[]>(demo?.manifest ?? []);
  const [report, setReport] = useState<FailsafeReport | null>(demo?.report ?? null);
  const [facts, setFacts] = useState<SafetyFacts>(demo?.facts ?? FALLBACK_FACTS);

  useEffect(() => {
    if (demo) return;
    let live = true;
    invoke<ChangeInfo[]>("changes_manifest_cmd")
      .then((m) => live && Array.isArray(m) && setManifest(m))
      .catch(() => undefined);
    invoke<SafetyFacts>("safety_facts")
      .then((f) => live && Array.isArray(f?.protectedKeys) && setFacts(f))
      .catch(() => undefined);
    const readFailsafe = () =>
      invoke<FailsafeReport>("failsafe_status")
        .then((r) => live && !!r?.status && setReport(r))
        .catch(() => undefined);
    void readFailsafe();
    const un = listen("lens://failsafe-notice", () => void readFailsafe());
    return () => {
      live = false;
      un.then((off) => off()).catch(() => undefined);
    };
  }, [demo]);

  const groups = changeGroups(manifest);
  const safe = safeModeLine(report);

  return (
    <div className="cc-card" data-guide-id="safety-card">
      <div className="sf-head">
        <div>
          <div className="cc-label">Safety</div>
          <div className="cc-desc">What Lens changes on this PC, what it never touches, and the ways back to plain Windows.</div>
        </div>
        <div className="sf-actions">
          <button type="button" className="cc-btn-ghost" onClick={() => void openSettingsAt(SAFETY_LINKS.report)}>
            Report a problem
          </button>
          <button type="button" className="cc-btn-ghost" onClick={() => void openSettingsAt(SAFETY_LINKS.removeAll)}>
            Remove all…
          </button>
        </div>
      </div>

      <ul className="sf-list" aria-label="Safety summary">
        <li className="sf-item">
          <div className="sf-term">What Lens touches</div>
          <div className="sf-body">
            {groups.length > 0 ? (
              <details className="sf-details">
                <summary>{changesLine(manifest)}</summary>
                {groups.map((g) => (
                  <div className="sf-group" key={g.id}>
                    <span className="sf-group-title">
                      {g.title} ({g.labels.length})
                    </span>
                    {" · "}
                    {g.note}
                    <div>{g.labels.join(", ")}</div>
                  </div>
                ))}
              </details>
            ) : (
              changesLine(manifest)
            )}
          </div>
        </li>
        <li className="sf-item">
          <div className="sf-term">Never touched</div>
          <div className="sf-body">{neverTouchedLine(facts)}</div>
        </li>
        <li className="sf-item">
          <div className="sf-term">Keys that always reach Windows</div>
          <div className="sf-body">
            <div className="sf-keys" aria-label="Keys Lens never takes">
              {facts.protectedKeys.map((k) => (
                <kbd className="sf-key" key={k}>
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        </li>
        <li className="sf-item">
          <div className="sf-term">Safe Mode</div>
          <div className="sf-body">
            <span className="sf-state">{safe.on ? "On. " : "Off. "}</span>
            {safe.text}
          </div>
        </li>
        <li className="sf-item">
          <div className="sf-term">At sign-in</div>
          <div className="sf-body">{signInLine(facts)}</div>
        </li>
        <li className="sf-item">
          <div className="sf-term">Remove all</div>
          <div className="sf-body">
            Undoes every change above and says what it did, step by step. Your files, the apps you installed and exported themes are left
            alone. If Lens itself won't open, run Fix-My-Desktop.bat from the Lens folder.
          </div>
        </li>
      </ul>
    </div>
  );
};
