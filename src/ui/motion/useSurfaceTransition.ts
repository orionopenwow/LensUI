// useSurfaceTransition: enter and exit for a whole surface window, coordinated with the backend.
//
// Rule (docs/SMOOTHNESS.md, D2/D3): the native window never changes while the page animates.
//   Show: the backend places the window at its final size while it is still hidden, shows it, then
//         says "open"; the page (which was left in its entry pose, fully transparent, when it last
//         closed) glides in.
//   Hide: the backend says "closing"; the page glides out and reports back (`surface_exit_done_cmd`);
//         only then is the window hidden. A fallback timer in the backend covers a stuck page.
// A page hidden mid-animation therefore always ends on a transparent frame, which is also the first
// frame WebView2 shows next time (it does not paint while hidden).
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { duration } from "./tokens";

export type SurfacePhase = "is-open" | "is-pre-open" | "is-closing";

interface GlideEvent {
  label: string;
  state: "pre" | "open" | "closing";
  /** Present on "closing": echo it back so a stale exit can't hide a reopened window. */
  gen?: number;
}

export function useSurfaceTransition(label: string): SurfacePhase {
  const [phase, setPhase] = useState<SurfacePhase>("is-open");
  const exitTimer = useRef(0);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const open = () => {
      window.clearTimeout(exitTimer.current);
      setPhase("is-pre-open");
      // Two frames: one to commit the entry pose, one so the transition has a start value.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setPhase("is-open"));
      });
    };
    const unlisten = listen<GlideEvent>("lens://surface-glide", (e) => {
      const p = e.payload;
      if (!p || p.label !== label) return;
      if (p.state === "closing") {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        setPhase("is-closing");
        window.clearTimeout(exitTimer.current);
        // The exit transition runs for --lens-dur-exit; one extra frame lets the last frame paint.
        exitTimer.current = window.setTimeout(() => {
          requestAnimationFrame(() => {
            invoke("surface_exit_done_cmd", { label, gen: p.gen ?? 0 }).catch(() => {});
          });
        }, duration("exit") + 8);
      } else if (p.state === "pre") {
        setPhase("is-pre-open");
      } else {
        open();
      }
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(exitTimer.current);
      unlisten.then((fn) => fn());
    };
  }, [label]);

  return phase;
}
