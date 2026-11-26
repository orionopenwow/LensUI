import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChangeInfo } from "../types/generated";
import { removeAllPreview } from "../safety/model";

interface BackupSummary {
  files: string[];
  secretsRemoved: number;
  includesTraining: boolean;
  configVersion: number;
}

interface RestoreReport {
  restored: string[];
  skipped: string[];
  previousSavedTo: string;
  dnd: boolean | null;
  migratedFromVersion: number | null;
}

interface UninstallStep {
  step: string;
  ok: boolean;
  detail: string;
}

const CONFIRM_WORD = "REMOVE";

/**
 * Control Center card: back up / restore all Lens settings (.lensbackup), and
 * "Remove all Lens changes" (puts Windows back as it was). Backend: win_backup.rs, win_uninstall.rs.
 */
export const BackupRestoreCard: React.FC = () => {
  const [includeTraining, setIncludeTraining] = useState(false);
  const [restorePath, setRestorePath] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteData, setDeleteData] = useState(false);
  const [steps, setSteps] = useState<UninstallStep[] | null>(null);
  const [manifest, setManifest] = useState<ChangeInfo[]>([]);

  // What Remove all will walk, read when the person opens the confirmation (the same registry
  // the backend uses), so they see the list before typing the confirm word.
  useEffect(() => {
    if (!confirming || manifest.length > 0) return;
    let live = true;
    invoke<ChangeInfo[]>("changes_manifest_cmd")
      .then((m) => live && Array.isArray(m) && setManifest(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [confirming, manifest.length]);
  const preview = removeAllPreview(manifest);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const res = await invoke<{ path: string; summary: BackupSummary }>("export_backup_cmd", {
        includeTraining,
      });
      setStatus(
        `Saved ${res.summary.files.length} item(s) to ${res.path}` +
          (res.summary.secretsRemoved > 0
            ? ` (${res.summary.secretsRemoved} saved key(s) or token(s) left out).`
            : ".")
      );
    } catch (e) {
      setStatus(`Couldn't save the backup: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    const path = restorePath.trim().replace(/^"|"$/g, "");
    if (!path) return;
    setBusy(true);
    try {
      const rep = await invoke<RestoreReport>("import_backup_cmd", {
        path,
        restoreTraining: includeTraining,
      });
      setStatus(
        `Restored ${rep.restored.length} item(s). Your previous settings were kept in ${rep.previousSavedTo}.` +
          (rep.skipped.length ? ` Skipped: ${rep.skipped.join(", ")}.` : "")
      );
    } catch (e) {
      setStatus(`Couldn't restore: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    setBusy(true);
    try {
      const res = await invoke<UninstallStep[]>("remove_all_lens_changes_cmd", { deleteData });
      setSteps(res);
      setConfirming(false);
      setConfirmText("");
    } catch (e) {
      setStatus(`Couldn't finish: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-card">
      <div className="cc-label">Back up &amp; restore</div>
      <div className="cc-desc">
        Saves your settings, themes, window rules and agent rules to one .lensbackup file in Documents. Saved
        keys and tokens are always left out.
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Include workflow recordings and training data</div>
          <div className="cc-desc">Off by default. Applies to both saving and restoring.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={includeTraining}
          aria-label="Include workflow recordings and training data"
          className={`cc-toggle ${includeTraining ? "on" : ""}`}
          onClick={() => setIncludeTraining((v) => !v)}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="cc-btn" disabled={busy} onClick={exportBackup}>
          Save Backup
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="cc-input"
          style={{ flex: 1 }}
          aria-label="Path of a .lensbackup file to restore"
          placeholder="C:\Users\You\Documents\LensUI-20261121-233000.lensbackup"
          value={restorePath}
          onChange={(e) => setRestorePath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") restoreBackup();
          }}
        />
        <button type="button" className="cc-btn-ghost" disabled={busy || !restorePath.trim()} onClick={restoreBackup}>
          Restore
        </button>
      </div>

      {status && (
        <div className="cc-desc" role="status">
          {status}
        </div>
      )}

      <div className="cc-row" style={{ marginTop: 6 }}>
        <div>
          <div className="cc-label">Remove all Lens changes</div>
          <div className="cc-desc">
            Restores folder icons, the Windows taskbar and desktop icons, window borders, and turns off shell
            mode and start-with-Windows. Use before uninstalling.
          </div>
        </div>
        {!confirming && (
          <button type="button" className="cc-btn-ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Remove…
          </button>
        )}
      </div>

      {confirming && (
        <>
          {preview && (
            <div className="cc-desc" role="status" data-remove-all-preview>
              <details>
                <summary>{preview.line}</summary>
                <div>{preview.labels.join(", ")}.</div>
              </details>
              <div>{preview.keeps}</div>
            </div>
          )}
          <div className="cc-row">
            <div className="cc-desc">Also delete Lens settings, themes and training data</div>
            <button
              type="button"
              role="switch"
              aria-checked={deleteData}
              aria-label="Also delete Lens settings, themes and training data"
              className={`cc-toggle ${deleteData ? "on" : ""}`}
              onClick={() => setDeleteData((v) => !v)}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="cc-input"
              style={{ flex: 1 }}
              aria-label={`Type ${CONFIRM_WORD} to confirm`}
              placeholder={`Type ${CONFIRM_WORD} to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            <button
              type="button"
              className="cc-btn"
              disabled={busy || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
              onClick={removeAll}
            >
              Remove Changes
            </button>
            <button
              type="button"
              className="cc-btn-ghost"
              onClick={() => {
                setConfirming(false);
                setConfirmText("");
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {steps && (
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((s) => (
            <div key={s.step} className="cc-desc">
              <span style={{ color: s.ok ? "var(--lens-positive)" : "var(--lens-danger)" }}>
                {s.ok ? "Done" : "Failed"}
              </span>{" "}
              · {s.step}: {s.detail}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" className="cc-btn" onClick={() => invoke("quit_lens").catch(() => {})}>
              Quit Lens
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
