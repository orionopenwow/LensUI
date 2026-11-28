// The Lens setup window (`?surface=setup`, docs/SETUP.md): full-screen slides. Rust builds it at
// start-up when the setup is due (first launch, a new version, or the launcher asked) and opens it
// by itself; "Setup Wizard" in Settings, About › Setup and Command "setup" open it any time.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLensState } from "../hooks/useLensState";
import { SetupWizard } from "../components/SetupWizard";
import { ToastHost } from "../ui/Toast";
import { useSurfaceExitAck } from "../ui/motion/useSurfaceTransition";
import { quiet } from "../ui/oops";
import { setupReason, type SetupStatus } from "./flow";

export function SetupSurface() {
  const { config, winTheme, updateConfig } = useLensState();
  useSurfaceExitAck("setup");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  // A fresh setup each time the window opens (the page reloads while hidden after Finish).
  const [run, setRun] = useState(0);
  useEffect(() => {
    invoke<SetupStatus>("setup_status_cmd")
      .then(setStatus)
      .catch(() => setStatus({ version: "", seenVersion: "", onboardingCompleted: true, forced: false }));
  }, [run]);

  if (!config || !status) return <div className="wiz wiz-full" aria-busy="true" />;
  // Opened by hand with nothing due, or again after this window's setup was finished or skipped:
  // the full first-run slides ("Run setup again").
  const reason = run > 0 ? "first" : setupReason(status) ?? "first";
  return (
    <>
      <SetupWizard
        key={run}
        config={config}
        winTheme={winTheme}
        reason={reason}
        version={status.version}
        seenVersion={status.seenVersion || config.setupSeenVersion || ""}
        onUpdateConfig={(next) => void updateConfig(next)}
        onFinish={() => {
          invoke("hide_surface", { label: "setup" }).catch(quiet);
          setStatus(null);
          setRun((r) => r + 1);
        }}
      />
      <ToastHost />
    </>
  );
}
