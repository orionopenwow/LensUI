// Types for catalog/apps/catalog.json (schema: catalog/apps/schema.json).

export type InstallMethod = "winget" | "githubRelease" | "via" | "officialSite" | "web";

export type InstallSpec =
  | { method: "winget"; wingetId: string; wingetVerified: boolean }
  | { method: "githubRelease"; repo: string; hints: string[]; fallbackUrl?: string }
  | { method: "via"; via: string; fallbackUrl?: string }
  | { method: "officialSite"; url: string }
  | { method: "web"; url: string };

export type RecipeStep =
  | { kind: "addToDock" }
  | { kind: "openWith"; extensions: string[] }
  | { kind: "rightClick"; actions: string[] }
  | { kind: "localModelProvider"; provider: string }
  | { kind: "mcpServer"; name: string; command: string; args: string[] }
  | { kind: "voiceVerbs"; phrases: string[] }
  | { kind: "guideLesson"; lesson: string };

export interface CatalogApp {
  id: string;
  name: string;
  category: string;
  collections: string[];
  status: "stable" | "beta" | "alpha";
  pitch: string;
  why: string;
  replaces: string[];
  openSource: boolean;
  license: string;
  licenseVerified: boolean;
  publisher: string;
  homepage: string;
  repo: string | null;
  stars: string | null;
  lastRelease: string | null;
  size: string | null;
  platforms: string[];
  install: InstallSpec;
  media: AppMedia;
  integration: { fileTypes: string[]; mcp: boolean; cli: string | null; urlScheme: string | null; voice: string[] };
  recipe: RecipeStep[];
  notes: string | null;
  sources: string[];
}

/** Official media, loaded at runtime from the project's own repo (pinned commit). */
export interface AppMedia {
  icon: string | null;
  screenshots: string[];
  /** Optional short muted demo loop (mp4/webm/gif/animated webp). */
  loop: string | null;
  credit: string;
  sourceUrl: string;
  /** Why the icon or screenshots are missing, when they are. */
  noMedia: string | null;
  /** The icon is drawn for light backgrounds; show it on a light plate. */
  iconPlate: boolean;
}

export interface Catalog {
  version: number;
  updated: string;
  collections: { id: string; title: string; subtitle?: string }[];
  categories: { id: string; title: string }[];
  apps: CatalogApp[];
}

/** Installed state from `apps_installed` (winget apps) plus what Lens installed itself. */
export interface InstalledInfo {
  version: string;
  available: string | null;
}

export type Stage = "resolving" | "downloading" | "verifying" | "installing" | "done" | "failed";

export interface ProgressEvent {
  jobId: string;
  appId: string;
  /** install | upgrade | uninstall | download */
  op: string;
  stage: Stage;
  pct: number | null;
  message: string;
}

export interface Agreement {
  label: string;
  text: string;
}

export interface AppShow {
  id: string;
  name: string;
  version: string;
  publisher: string;
  license: string;
  licenseUrl: string;
  homepage: string;
  agreements: Agreement[];
  installerType: string;
  installerUrl: string;
  installerSha256: string;
  installerSize: number | null;
}

export interface PreparedRelease {
  token: string;
  appId: string;
  tag: string;
  fileName: string;
  size: number;
  sha256: string;
  checksum: "verified" | "none";
  signatureStatus: string;
  publisher: string | null;
  sourceUrl: string;
}

export interface RecipeStepView {
  index: number;
  kind: RecipeStep["kind"];
  description: string;
}

export interface AppsSettings {
  autoUpdate: boolean;
  checkUpdates: "never" | "weekly" | "daily";
  showNonOpenSource: boolean;
  liveThumbnails: boolean;
}

export const DEFAULT_SETTINGS: AppsSettings = { autoUpdate: false, checkUpdates: "weekly", showNonOpenSource: true, liveThumbnails: true };
