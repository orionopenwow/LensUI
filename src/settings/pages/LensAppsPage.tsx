import React from "react";
import { LensApps } from "../../apps/LensApps";
import { AppsCard } from "../../components/AppsCard";
import { Section } from "../ui/primitives";
import type { PageProps } from "./common";

/** Lens › Apps: the curated free and open-source catalogue (docs/LENS_APPS.md). */
export const LensAppsPage: React.FC<PageProps> = ({ section }) => (
  <>
    <div className="cc-card" style={{ position: "relative", padding: 0, overflow: "hidden" }}>
      <LensApps />
    </div>
    <Section id="settings" title="Lens Apps settings" summary="Updates, activity log, remove what Lens installed" defaultOpen={section === "settings"} forceOpen={section === "settings"}>
      <AppsCard />
    </Section>
  </>
);
