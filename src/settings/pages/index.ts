import React, { lazy } from "react";
import type { PageId } from "../registry";
import type { PageProps } from "./common";
import { QuickPage } from "./QuickPage";

// Pages load on first visit, so opening Settings doesn't parse every page (and the AI, Apps and
// Music cards behind them) up front. ControlCenterSurface wraps them in <Suspense>.
const page = (load: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.FC<PageProps> })));

/** Pages that live in their own file. The rest (Appearance, Dock & Bar, Desktop, Windows & Keys,
 *  System & Tasks, Notifications) are still rendered by ControlCenterSurface. */
export const PAGE_COMPONENTS: Partial<Record<PageId, React.FC<PageProps>>> = {
  // Settings opens on Quick: loaded with the hub so the first view never shows a loading skeleton.
  quick: QuickPage,
  display: page(() => import("./DisplayPage"), "DisplayPage") as unknown as React.FC<PageProps>,
  sound: page(() => import("./SoundPage"), "SoundPage") as unknown as React.FC<PageProps>,
  network: page(() => import("./NetworkPage"), "NetworkPage") as unknown as React.FC<PageProps>,
  power: page(() => import("./PowerPage"), "PowerPage") as unknown as React.FC<PageProps>,
  apps: page(() => import("./AppsPage"), "AppsPage") as unknown as React.FC<PageProps>,
  storage: page(() => import("./StoragePage"), "StoragePage") as unknown as React.FC<PageProps>,
  focus: page(() => import("./FocusPage"), "FocusPage") as unknown as React.FC<PageProps>,
  privacy: page(() => import("./PrivacyPage"), "PrivacyPage") as unknown as React.FC<PageProps>,
  update: page(() => import("./UpdatePage"), "UpdatePage") as unknown as React.FC<PageProps>,
  time: page(() => import("./TimePage"), "TimePage") as unknown as React.FC<PageProps>,
  accessibility: page(() => import("./AccessibilityPage"), "AccessibilityPage") as unknown as React.FC<PageProps>,
  gaming: page(() => import("./GamingPage"), "GamingPage") as unknown as React.FC<PageProps>,
  ai: page(() => import("./AiCommandPage"), "AiCommandPage") as unknown as React.FC<PageProps>,
  about: page(() => import("./AboutPage"), "AboutPage") as unknown as React.FC<PageProps>,
  store: page(() => import("./LensAppsPage"), "LensAppsPage") as unknown as React.FC<PageProps>,
  music: page(() => import("./MusicPage"), "MusicPage") as unknown as React.FC<PageProps>,
};
