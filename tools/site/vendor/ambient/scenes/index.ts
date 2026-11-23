import type { AmbientScene } from "../core";
import { wavesScene } from "./waves";
import { driftAuroraScene } from "./aurora";
import { breatheScene } from "./breathe";
import { starDriftScene } from "./stars";
import { ditherDunesScene } from "./dunes";
import { halftoneTideScene } from "./halftone";
import { contoursScene, glowContoursScene } from "./contours";
import { grainFogScene } from "./fog";
import { plotterScene } from "./plotter";
import { paperScene } from "./paper";
import { scanlineScene } from "./scanlines";
import { causticsScene } from "./caustics";
import { pixelCloudsScene } from "./pixelclouds";

/** Every ambient backdrop, in the order the scene picker lists them. */
export const AMBIENT_SCENES: AmbientScene[] = [
  wavesScene,
  driftAuroraScene,
  breatheScene,
  starDriftScene,
  ditherDunesScene,
  halftoneTideScene,
  contoursScene,
  glowContoursScene,
  grainFogScene,
  plotterScene,
  paperScene,
  scanlineScene,
  causticsScene,
  pixelCloudsScene,
];

export function ambientSceneById(id: string | null | undefined): AmbientScene | null {
  return AMBIENT_SCENES.find((s) => s.id === id) ?? null;
}
