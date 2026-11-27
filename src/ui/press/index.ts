// Lens press primitive (DESIGN.md §5.2): weighty presses for every control, by attribute.
//   installPress()          once per window (main.tsx does it); idempotent
//   usePress({ weight })    attributes + pending release for a React element
//   pressProps({ weight })  the same attributes without a hook
//   data-weight="light|medium|heavy" on any element works on its own once installPress() ran.
import "./press.css";
export { installPress, machineFor, pressableFrom } from "./delegate";
export { usePress, pressProps } from "./usePress";
export type { PressOptions, PressProps } from "./usePress";
export { PressMachine, weightOf, isDisabled, WEIGHTS } from "./machine";
export type { PressClock, PressHost, PressState, PressTiming } from "./machine";
export { CLASS_WEIGHTS, CLASS_SELECTOR, classWeight } from "./weights";
