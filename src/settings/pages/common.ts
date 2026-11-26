import type { LensConfig } from "../../types/lens";

export interface PageProps {
  /** Section a deep link asked for, if any. */
  section?: string;
  config: LensConfig;
  updateConfig: (c: LensConfig) => void;
  /** Content the Settings shell owns that belongs inside this page (it needs the shell's live
   *  data). The page decides where it goes. */
  slot?: import("react").ReactNode;
}
