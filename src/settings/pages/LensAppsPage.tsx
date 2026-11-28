import React, { useEffect, useState } from "react";
import { LensApps } from "../../apps/LensApps";
import { desktopIconOn, openLensApps, setDesktopIcon } from "../../apps/desktopIcon";
import { AppsCard } from "../../components/AppsCard";
import { toast } from "../../ui/toastBus";
import { Section } from "../ui/primitives";
import type { PageProps } from "./common";

/** "Open in its own window" and the optional Lens Apps icon on the desktop. */
const LensAppsShortcuts: React.FC = () => {
  const [iconOn, setIconOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    desktopIconOn().then(setIconOn);
  }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      setIconOn(await setDesktopIcon(!iconOn));
    } catch (e) {
      toast.error(`Couldn't ${iconOn ? "remove" : "add"} the Lens Apps desktop icon. ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cc-card" data-lens-apps-shortcuts>
      <div className="tux-row">
        <div className="tux-row-text">
          <div className="cc-label">Lens Apps on your desktop</div>
          <div className="cc-desc">One shortcut that opens Lens Apps. Remove all Lens changes takes it away too.</div>
        </div>
        <button
          data-weight="light"
          type="button"
          role="switch"
          aria-checked={iconOn}
          aria-label="Lens Apps icon on the desktop"
          aria-busy={busy || undefined}
          className={`cc-toggle ${iconOn ? "on" : ""}`}
          onClick={() => !busy && void toggle()}
        />
      </div>
      <div className="tux-row">
        <div className="tux-row-text">
          <div className="cc-label">Its own window</div>
          <div className="cc-desc">Lens Apps in a bigger window of its own. Command “/apps” opens it too.</div>
        </div>
        <button data-weight="medium" type="button" className="cc-btn tux-small-btn" onClick={() => openLensApps().catch(() => toast.error("Couldn't open Lens Apps."))}>
          Open window
        </button>
      </div>
    </div>
  );
};

/** Lens › Apps: the curated free and open-source catalogue (docs/LENS_APPS.md). */
export const LensAppsPage: React.FC<PageProps> = ({ section }) => (
  <>
    <div className="cc-card" style={{ position: "relative", padding: 0, overflow: "hidden" }}>
      <LensApps />
    </div>
    <LensAppsShortcuts />
    <Section id="settings" title="Lens Apps settings" summary="Updates, activity log, remove what Lens installed" defaultOpen={section === "settings"} forceOpen={section === "settings"}>
      <AppsCard />
    </Section>
  </>
);
