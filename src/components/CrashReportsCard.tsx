import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CrashReportInfo {
  name: string;
  createdMs: number;
  summary: string;
}

/**
 * Control Center card: crash reports Lens wrote on this PC (%APPDATA%\LensUI\crashes, newest 10).
 * Nothing is uploaded; "Copy report" puts one on the clipboard so it can be pasted into an issue.
 * Backend: win_crash.rs.
 */
export const CrashReportsCard: React.FC = () => {
  const [reports, setReports] = useState<CrashReportInfo[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<CrashReportInfo[]>("list_crash_reports_cmd")
      .then((r) => setReports(r ?? []))
      .catch(() => setReports([]));
  }, []);

  useEffect(refresh, [refresh]);

  const copy = async (name: string) => {
    try {
      const text = await invoke<string>("read_crash_report_cmd", { name });
      await navigator.clipboard.writeText(text);
      setStatus("Report copied. Paste it into a GitHub issue; check it first, nothing was sent.");
    } catch (e) {
      setStatus(`Couldn't copy the report: ${String(e)}`);
    }
  };

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Crash reports</div>
          <div className="cc-desc">
            Kept on this PC only (newest 10). User names and personal paths are removed. Nothing is uploaded.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="cc-btn-ghost" onClick={refresh}>
            Refresh
          </button>
          <button
            type="button"
            className="cc-btn-ghost"
            onClick={() => invoke("open_crashes_folder_cmd").catch(() => {})}
          >
            Open Folder
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="cc-desc">No crashes recorded.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reports.map((r) => (
            <div key={r.name} className="cc-row" style={{ padding: "6px 0" }}>
              <div style={{ minWidth: 0 }}>
                <div className="cc-label">{new Date(r.createdMs).toLocaleString()}</div>
                <div className="cc-desc" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.summary || "No message"}
                </div>
              </div>
              <button type="button" className="cc-btn" onClick={() => copy(r.name)}>
                Copy report
              </button>
            </div>
          ))}
        </div>
      )}

      {status && <div className="cc-desc">{status}</div>}
    </div>
  );
};
