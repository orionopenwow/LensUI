import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../types/lens";

/** Mirrors win_keyhook::KeyhookStatus. */
interface KeyhookStatus {
  winLauncher: boolean;
  altTab: boolean;
  active: boolean;
  suspended: boolean;
  pausedForFullscreen: boolean;
  lastProblem: string;
}

type ShellKeysFunc = { winKeyLauncher?: boolean; altTabOverview?: boolean };

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

/**
 * Control Center card: let Lens answer the Win key (Launcher) and Alt+Tab (Overview).
 * Both are off by default. Windows' own Start and Alt+Tab take over automatically whenever Lens
 * doesn't respond within 300 ms, and the hook stands aside while a fullscreen game is in front.
 */
export const ShellKeysCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const func = config.func as LensConfig["func"] & ShellKeysFunc;
  const [status, setStatus] = useState<KeyhookStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      invoke<KeyhookStatus>("get_keyhook_status_cmd")
        .then((s) => alive && setStatus(s))
        .catch(() => alive && setStatus(null));
    poll();
    const t = window.setInterval(poll, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [func.winKeyLauncher, func.altTabOverview]);

  const set = (patch: ShellKeysFunc) =>
    onUpdateConfig({ ...config, func: { ...config.func, ...patch } as LensConfig["func"] });

  const anyOn = !!func.winKeyLauncher || !!func.altTabOverview;
  let state = "Off — Windows handles both keys.";
  if (anyOn && status) {
    if (status.suspended) state = "Paused — Lens didn't answer in time, so Windows is handling these keys until it does.";
    else if (status.pausedForFullscreen) state = "Standing aside while a fullscreen game or presentation is in front.";
    else if (status.active) state = "Active.";
    else state = "Starting…";
  } else if (anyOn) {
    state = "Needs a newer Lens backend — restart Lens UI after updating.";
  }

  return (
    <div className="cc-card" style={{ gap: 10, padding: "12px 14px" }}>
      <div className="cc-label">Start Key &amp; Alt+Tab</div>
      <div className="cc-desc">
        Let Lens answer the Windows keys. Win+E, Win+L, Win+Shift+S and every other Win combination keep
        working; only a single tap of the Win key opens the Launcher.
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Win Key Opens Lens Launcher</div>
          <div className="cc-desc">Tap the Windows key to open the Launcher instead of Start.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!func.winKeyLauncher}
          aria-label="Win key opens Lens Launcher"
          className={`cc-toggle ${func.winKeyLauncher ? "on" : ""}`}
          onClick={() => set({ winKeyLauncher: !func.winKeyLauncher })}
        />
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Alt+Tab Opens Lens Overview</div>
          <div className="cc-desc">Hold Alt, tap Tab to move, release Alt to switch. Esc cancels.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!func.altTabOverview}
          aria-label="Alt+Tab opens Lens Overview"
          className={`cc-toggle ${func.altTabOverview ? "on" : ""}`}
          onClick={() => set({ altTabOverview: !func.altTabOverview })}
        />
      </div>

      <div className="cc-desc" aria-live="polite">
        Status: {state}
        {status?.lastProblem ? ` ${status.lastProblem}` : ""}
      </div>
    </div>
  );
};
