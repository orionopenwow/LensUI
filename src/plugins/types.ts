/** Shapes shared by the plugin host, slot and manager. Mirrors win_plugins.rs. */

export type PluginSlotId = "topbar-left" | "topbar-right" | "dock" | "widgets";

export type PluginPermission =
  | "telemetry"
  | "media"
  | "storage"
  | "notifications"
  | "launch-apps"
  | "open-urls";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  slot: PluginSlotId;
  entry: string;
  permissions: PluginPermission[];
  refreshIntervalMs: number;
  width?: number | null;
  height?: number | null;
}

export interface PluginInfo {
  id: string;
  manifest: PluginManifest | null;
  enabled: boolean;
  error: string | null;
  grants: string[];
  path: string;
}

export interface PendingApproval {
  pluginId: string;
  grant: string;
  label: string;
}

export const SLOT_LABELS: Record<PluginSlotId, string> = {
  "topbar-left": "Top Bar, left",
  "topbar-right": "Top Bar, right",
  dock: "Dock",
  widgets: "Widget Drawer",
};

/** Plain-language description of each permission, shown before a plugin is enabled. */
export const PERMISSION_INFO: Record<PluginPermission, { label: string; detail: string; sensitive: boolean }> = {
  telemetry: { label: "System stats", detail: "Read CPU, memory and uptime.", sensitive: false },
  media: { label: "Now playing", detail: "Read the current song or video title.", sensitive: false },
  storage: { label: "Remember settings", detail: "Keep up to 32 KB of its own data.", sensitive: false },
  notifications: { label: "Notifications", detail: "Show you a notification (at most one every 10 s).", sensitive: false },
  "launch-apps": { label: "Open apps", detail: "Start apps from your Start menu, each one only after you approve it.", sensitive: true },
  "open-urls": { label: "Open web links", detail: "Open https links in your browser, each site only after you approve it.", sensitive: true },
};

export const PLUGINS_CHANGED_EVENT = "lens://plugins-changed";
