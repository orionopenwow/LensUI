// Dock search's close glide (B-130). Closing glides the results panel out and holds its end pose
// (opacity 0) until the row collapses. A press on the search glass during that glide opens search
// again: the panel stays mounted, so the exit must be stopped before it commits opacity 0 inline,
// any pose it already left must go, and the "closing" state (pointer-events: none) must be
// dropped. Otherwise search reopens with an invisible, unclickable results panel.
import { clearPose, glideOut, type GlideHandle } from "../ui/motion";

export interface SearchCloseGlide {
  /** Start the exit glide on the panel; resolves when it finishes, is stopped, or gives up. */
  start(drawer: Element | null | undefined): Promise<void>;
  /** Search opens again: stop a running exit and put the panel back to its CSS. True if one was running. */
  interrupt(drawer: Element | null | undefined): boolean;
  /** An exit glide is running. */
  readonly running: boolean;
}

export function createSearchCloseGlide(exit: (el: Element | null | undefined) => GlideHandle = (el) => glideOut(el, { y: 14, opacity: 0 }, { duration: "base" })): SearchCloseGlide {
  let current: GlideHandle | null = null;
  return {
    start(drawer) {
      current?.cancel();
      const h = exit(drawer);
      current = h;
      return h.finished.then(() => {
        if (current === h) current = null;
      });
    },
    interrupt(drawer) {
      const h = current;
      current = null;
      // Cancelled, the held exit never commits its end pose; clear one that already did.
      h?.cancel();
      clearPose(drawer);
      return !!h;
    },
    get running() {
      return current !== null;
    },
  };
}
