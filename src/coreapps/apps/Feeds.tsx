// Lens Feeds: the Feeds column (RSS, Bluesky, Mastodon, GitHub…) in its own window. Sources and
// sign-ins are added in Settings › Notifications › Feeds; with none added the column says so.
import React from "react";
import type { LensConfig } from "../../types/generated";
import { AppShell } from "../shell/AppShell";
import { coreApp } from "../registry";
import { FeedsPanel } from "../../feeds/FeedsPanel";

export const Feeds: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void> }> = ({ config, updateConfig }) => (
  <AppShell
    app={coreApp("feeds")!}
    config={config}
    updateConfig={updateConfig}
    meta={<span>Posts open in Lens Browser. Nothing is posted without your approval.</span>}
  >
    <div className="ca-column">
      <FeedsPanel />
    </div>
  </AppShell>
);
