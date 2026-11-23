import type { LensConfig } from "../../types/lens";

export interface PageProps {
  /** Section a deep link asked for, if any. */
  section?: string;
  config: LensConfig;
  updateConfig: (c: LensConfig) => void;
}
