// The Lens motion engine (docs/SMOOTHNESS.md, R3). One way to move things:
//   glide / glideIn / glideOut   transform + opacity through the Web Animations API
//   captureFlip                  size and position changes without animating layout
//   usePresence / PresenceList   exits that finish before the element is removed
//   useSurfaceTransition         whole-window enter/exit, in step with the backend
//   springEasing                 springs as compositor-friendly linear() easings
//   fillStyle                    bars, meters and level waves as transforms, never width/height
export { glide, glideIn, glideOut, clearPose, poseKeyframe, poseTransform } from "./glide";
export type { GlideHandle, GlideOptions, Pose } from "./glide";
export { captureFlip, flipDelta } from "./flip";
export type { Box, FlipCapture, FlipDelta, FlipMode, FlipOptions } from "./flip";
export { usePresence, useLingering, PresenceList } from "./Presence";
export type { PresenceOptions, PresenceListProps } from "./Presence";
export { useSurfaceTransition, useSurfaceExitAck } from "./useSurfaceTransition";
export type { SurfacePhase } from "./useSurfaceTransition";
export { springAt, springDuration, springEasing } from "./spring";
export type { SpringOptions } from "./spring";
export { duration, ease, reducedMotion, parseMs, pressMs, releaseMs, DURATION_MS, EASE, PRESS_MS, PRESS_WEIGHT } from "./tokens";
export type { DurationToken, EaseToken, PressToken, PressWeight } from "./tokens";
export { fillStyle } from "./fill";
export { growPose, growFrom, returnTo, staggerDelay, staggerStep, staggerIn, swapDirection, swapPose, swapIn, STAGGER_CAP, SWAP_SHIFT, GROW_MIN_SCALE, GROW_MAX_SHIFT } from "./flow";
export type { GrowPose, SwapDirection } from "./flow";
export { installOriginBeacon, useGrowFromTrigger, localOrigin, layoutBox, ORIGIN_EVENT, ORIGIN_MAX_AGE_MS } from "./origin";
export type { SurfaceOrigin } from "./origin";
export { useSlidingIndicator, indicatorBox } from "./indicator";
