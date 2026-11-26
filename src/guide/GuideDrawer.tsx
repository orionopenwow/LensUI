// The Guide as a right-hand drawer inside a surface (Settings by default). Opens on
// `lens://guide/open` (from Command "/guide", the "?" buttons, voice "Lens, how do I…") and always
// hosts the coach-mark layer for "Show me". Mount once per window — see docs/GUIDE.md.
import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CoachMarkLayer } from "./CoachMarkLayer";
import { GuidePanel, type GuideContext } from "./GuidePanel";
import { GUIDE_EVENTS } from "./coach";
import { loadProgress } from "./progress";
import "./guide.css";

export interface GuideDrawerProps {
  config?: unknown;
  context?: GuideContext;
  aiEnabled?: boolean;
  /** Parity/testing: start open. */
  initiallyOpen?: boolean;
}

export const GuideDrawer: React.FC<GuideDrawerProps> = ({ config, context, aiEnabled, initiallyOpen }) => {
  const [open, setOpen] = useState(!!initiallyOpen);
  const [enabled, setEnabled] = useState<boolean | null>(initiallyOpen ? true : null);

  useEffect(() => {
    if (enabled === null) loadProgress().then((p) => setEnabled(p.enabled)).catch(() => setEnabled(false));
  }, [enabled]);

  useEffect(() => {
    const show = () => {
      // Re-read the switch: the Guide card may have just turned it on.
      loadProgress()
        .then((p) => {
          setEnabled(p.enabled);
          if (p.enabled) setOpen(true);
        })
        .catch(() => {});
    };
    window.addEventListener(GUIDE_EVENTS.open, show);
    let un: (() => void) | null = null;
    let alive = true;
    listen(GUIDE_EVENTS.open, show)
      .then((u) => (alive ? (un = u) : u()))
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener(GUIDE_EVENTS.open, show);
      un?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <>
      <CoachMarkLayer />
      {open && enabled && (
        <aside className="guide-drawer" aria-label="Guide" data-guide-id="guide">
          <GuidePanel config={config} context={context} aiEnabled={aiEnabled} onClose={() => setOpen(false)} />
        </aside>
      )}
    </>
  );
};

export default GuideDrawer;
