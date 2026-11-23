import type React from "react";
import type { PageId } from "../registry";
import type { PageProps } from "./common";
import { DisplayPage } from "./DisplayPage";
import { SoundPage } from "./SoundPage";
import { NetworkPage } from "./NetworkPage";
import { PowerPage } from "./PowerPage";
import { AppsPage } from "./AppsPage";
import { StoragePage } from "./StoragePage";
import { FocusPage } from "./FocusPage";
import { PrivacyPage } from "./PrivacyPage";
import { UpdatePage } from "./UpdatePage";
import { TimePage } from "./TimePage";
import { AccessibilityPage } from "./AccessibilityPage";
import { GamingPage } from "./GamingPage";
import { AiCommandPage } from "./AiCommandPage";
import { AboutPage } from "./AboutPage";
import { LensAppsPage } from "./LensAppsPage";
import { MusicPage } from "./MusicPage";

/** Pages that live in their own file. The rest (Appearance, Dock & Bar, Desktop, Windows & Keys,
 *  System & Tasks, Notifications) are still rendered by ControlCenterSurface. */
export const PAGE_COMPONENTS: Partial<Record<PageId, React.FC<PageProps>>> = {
  display: DisplayPage,
  sound: SoundPage,
  network: NetworkPage,
  power: PowerPage,
  apps: AppsPage,
  storage: StoragePage,
  focus: FocusPage,
  privacy: PrivacyPage,
  update: UpdatePage,
  time: TimePage,
  accessibility: AccessibilityPage,
  gaming: GamingPage,
  ai: AiCommandPage,
  about: AboutPage,
  store: LensAppsPage,
  music: MusicPage,
};
