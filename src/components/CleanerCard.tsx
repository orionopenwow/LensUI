// Settings › Storage › Lens Cleaner: open the window, and its schedule / alert / snapshot /
// Explorer-menu switches (all off by default). docs/CLEANER.md.
import React from "react";
import { Eraser as BrushCleaning } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPanel } from "../cleaner/SettingsPanel";
import "../cleaner/cleaner.css";
import { oops } from "../ui/oops";

export const CleanerCard: React.FC = () => (
  <div className="cc-card cl-card">
    <div className="cl-card-head">
      <span className="cl-brand-mark" aria-hidden>
        <BrushCleaning size={14} strokeWidth={2.4} />
      </span>
      <span className="cl-card-text">
        <strong>Lens Cleaner</strong>
        <span className="cl-meta-line">Find what's safe to remove and see what's taking up space. Nothing is deleted until you say so.</span>
      </span>
      <button data-weight="heavy" type="button" className="cl-btn is-primary is-sm" onClick={() => invoke("open_surface", { label: "cleaner" }).catch(oops("open Lens Cleaner"))}>
        Open Lens Cleaner
      </button>
    </div>
    <SettingsPanel onOpen={(uri) => invoke("open_windows_setting_cmd", { uri }).catch(oops("open that Windows page"))} />
  </div>
);
