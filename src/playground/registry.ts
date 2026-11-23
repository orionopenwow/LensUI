import type { SceneModule } from "./types";
import { sandScene } from "./scenes/sand";
import { fluidScene } from "./scenes/fluid";
import { flowFieldScene } from "./scenes/flowfield";
import { constellationScene } from "./scenes/constellation";
import { rainScene } from "./scenes/rain";
import { auroraScene } from "./scenes/aurora";
import { starfieldScene } from "./scenes/starfield";
import { skyClockScene } from "./scenes/skyclock";
import { ambientModule } from "./ambient/module";
import { backdropScene } from "../studio/backdrop/scene";
import { LIVING_SCENES } from "./living/module";

/** Gallery order: playful first, calm after. */
export const SCENES: SceneModule[] = [
  sandScene,
  fluidScene,
  flowFieldScene,
  constellationScene,
  auroraScene,
  rainScene,
  starfieldScene,
  skyClockScene,
  // Theme backdrop: the slow ambient scene matching the active theme pack (docs/AMBIENT.md).
  ambientModule,
  // Backdrop Lab looks as a live wallpaper (docs/BACKDROP_LAB.md).
  backdropScene,
  // Living Themes: the real sky, Sun and Moon (docs/LIVING_THEMES.md).
  ...LIVING_SCENES,
];

export function sceneById(id: string | null | undefined): SceneModule | null {
  return SCENES.find((s) => s.id === id) ?? null;
}

/** Scene used by idle mode when nothing else is chosen. */
export const DEFAULT_IDLE_SCENE = "aurora";
