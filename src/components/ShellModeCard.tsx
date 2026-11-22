import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ShellModeStatus {
  enabled: boolean;
  shellValue: string;
  exePath: string;
  explorerRunningAsShell: boolean;
  isShellSession: boolean;
  lastBootOk: boolean;
  lastBootNote: string;
  canEnable: boolean;
  blockedReason: string;
}

const CONFIRM_WORD = "REPLACE";

/**
 * Control Center card for opt-in Shell Mode (Lens UI instead of Explorer as the Windows shell).
 * Backend: src-tauri/src/win_shell.rs. Full explanation: docs/SHELL_MODE.md.
 */
export const ShellModeCard: React.FC = () => {
  const [status, setStatus] = useState<ShellModeStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    invoke<ShellModeStatus>("get_shell_mode_status_cmd")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  const run = async (command: string, done: string) => {
    setBusy(true);
    try {
      const result = await invoke<ShellModeStatus | null>(command);
      if (result) setStatus(result);
      else refresh();
      setMessage(done);
    } catch (e) {
      setMessage(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setConfirming(false);
    setConfirmText("");
    await run(
      "enable_shell_mode_cmd",
      "Shell Mode is on. It takes effect the next time you sign in to Windows."
    );
  };

  const stateLabel = !status
    ? "Unavailable"
    : status.isShellSession
      ? "Lens UI is your Windows shell right now"
      : status.enabled
        ? "On — starts at your next sign-in"
        : "Off — Lens UI runs on top of Explorer";

  const dotColor = !status ? "var(--lens-fg-muted)" : status.enabled ? "#34D399" : "var(--lens-fg-muted)";

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Shell Mode (advanced)</div>
          <div className="cc-desc">
            Start Lens UI instead of the Windows taskbar and desktop when you sign in. This account only.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor }} />
          <span className="cc-desc" style={{ color: "var(--lens-fg-secondary)" }}>
            {stateLabel}
          </span>
        </div>
      </div>

      <div className="cc-desc">
        Without Explorer you lose its taskbar, Start menu, tray icons, desktop icons, Windows notifications
        and most Win-key shortcuts. Lens UI starts your own startup apps. If Lens UI fails to reach the
        desktop once, it switches this off by itself and brings Explorer back. You can also get back any
        time with Restore-Windows-Shell.bat, or Ctrl+Shift+Esc, Run new task, and that file.
      </div>

      {status && !status.lastBootOk && status.lastBootNote && (
        <div
          className="cc-desc"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgb(251 191 36 / 0.45)",
            background: "rgb(251 191 36 / 0.1)",
            color: "var(--lens-fg)",
          }}
        >
          {status.lastBootNote}
        </div>
      )}

      {status && !status.enabled && !status.canEnable && (
        <div className="cc-desc">{status.blockedReason}</div>
      )}

      {confirming && status && !status.enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="cc-desc" style={{ color: "var(--lens-fg)" }}>
            Type {CONFIRM_WORD} to confirm. Nothing changes until your next sign-in.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="cc-input"
              style={{ flex: 1 }}
              value={confirmText}
              autoFocus
              spellCheck={false}
              aria-label={`Type ${CONFIRM_WORD} to confirm`}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enable();
                if (e.key === "Escape") {
                  setConfirming(false);
                  setConfirmText("");
                }
              }}
            />
            <button
              type="button"
              className="cc-btn"
              disabled={busy || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
              style={{
                opacity: confirmText.trim().toUpperCase() === CONFIRM_WORD ? 1 : 0.45,
                cursor: confirmText.trim().toUpperCase() === CONFIRM_WORD ? "pointer" : "default",
              }}
              onClick={enable}
            >
              Turn on Shell Mode
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
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {status && !status.enabled && !confirming && (
          <button
            type="button"
            className="cc-btn"
            disabled={busy || !status.canEnable}
            style={{
              opacity: status.canEnable ? 1 : 0.45,
              cursor: status.canEnable ? "pointer" : "default",
            }}
            onClick={() => {
              setMessage(null);
              setConfirming(true);
            }}
          >
            Turn on…
          </button>
        )}
        {status && status.enabled && (
          <button
            type="button"
            className="cc-btn"
            disabled={busy}
            onClick={() =>
              run("disable_shell_mode_cmd", "Shell Mode is off. Windows will start Explorer at your next sign-in.")
            }
          >
            Turn off
          </button>
        )}
        {status && !status.explorerRunningAsShell && (
          <button
            type="button"
            className="cc-btn-ghost"
            disabled={busy}
            onClick={() =>
              run("start_explorer_shell_cmd", "Starting Explorer. The taskbar should appear in a few seconds.")
            }
          >
            Start Explorer now
          </button>
        )}
        <button type="button" className="cc-btn-ghost" disabled={busy} onClick={refresh}>
          Refresh
        </button>
      </div>

      {message && <div className="cc-desc">{message}</div>}
    </div>
  );
};
