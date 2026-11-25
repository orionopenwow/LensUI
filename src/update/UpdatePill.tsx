// Top Bar pill while a Lens update is available, downloading or ready (docs/RELEASING.md,
// "Updates inside the app"). "Restart to update" is the one click that installs.
import React, { useState } from "react";
import { RotateCw } from "lucide-react";
import { openUpdatesInSettings, useLensUpdate } from "./useLensUpdate";
import { viewOf } from "./model";
import "./update.css";

export const UpdatePill: React.FC = () => {
  const { status, restart } = useLensUpdate();
  const [failed, setFailed] = useState<string | null>(null);
  const view = viewOf(status);
  if (!view.pill) return null;
  const label = failed ?? view.pill;
  const onClick = () => {
    if (view.action === "restart") {
      setFailed(null);
      restart().catch((e) => setFailed(`Update didn't install: ${String(e)}`.slice(0, 80)));
    } else if (view.action === "open") {
      void openUpdatesInSettings();
    }
  };
  return (
    <button
      type="button"
      className={`lu-pill ${view.action === "restart" ? "is-ready" : ""}`}
      data-guide-id="topbar.update"
      aria-label={view.action === "restart" ? `Lens ${status.newVersion ?? ""} is ready. Restart to update.` : label}
      aria-busy={view.busy || undefined}
      disabled={view.action === "none"}
      onClick={onClick}
    >
      <RotateCw size={12} strokeWidth={2.6} aria-hidden />
      {label}
    </button>
  );
};
