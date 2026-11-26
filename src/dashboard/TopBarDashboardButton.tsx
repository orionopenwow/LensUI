// The Top Bar's Dashboard button (owner decision: the Dashboard opens from the Top Bar and from
// Command, no Dock icon, no new hotkey). Renders nothing while magicWaves.dashboard is off, so
// the Top Bar can mount it unconditionally:
//   <TopBarDashboardButton config={config} />
import React from "react";
import { emit } from "@tauri-apps/api/event";
import { LensCloud } from "../presence/LensCloud";
import { isOn } from "../magicwaves/flags";
import type { LensConfig } from "../types/lens";
import "./dashboard.css";

/** Event the Dashboard window (a later wave) listens for. */
export const OPEN_DASHBOARD_EVENT = "lens://dashboard-open";

export const TopBarDashboardButton: React.FC<{ config: LensConfig | null; onOpen?: () => void }> = ({ config, onOpen }) => {
  if (!isOn(config, "dashboard")) return null;
  return (
    <button
      type="button"
      className="mdb-topbar-btn"
      aria-label="Open the Dashboard"
      onClick={() => (onOpen ? onOpen() : void emit(OPEN_DASHBOARD_EVENT, {}).catch(() => {}))}
    >
      <span className="mdb-orb" aria-hidden="true">
        <LensCloud />
      </span>
    </button>
  );
};
