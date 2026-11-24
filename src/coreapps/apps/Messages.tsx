// Lens Messages: one inbox over the messengers you already use, in its own window. Each messenger
// stays its own official web app; Lens reads only the unread count. Set up in Settings ›
// Notifications › Messages.
import React from "react";
import type { LensConfig } from "../../types/generated";
import { AppShell } from "../shell/AppShell";
import { coreApp } from "../registry";
import { MessagesPanel } from "../../messages/MessagesPanel";
import "../../feeds/Feeds.css";
import "../../messages/Messages.css";

export const Messages: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void> }> = ({ config, updateConfig }) => (
  <AppShell
    app={coreApp("messages")!}
    config={config}
    updateConfig={updateConfig}
    meta={<span>Lens reads unread counts only. Replies need your approval.</span>}
  >
    <div className="ca-column">
      <MessagesPanel />
    </div>
  </AppShell>
);
