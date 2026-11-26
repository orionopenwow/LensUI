// glide(): the one way Lens moves things in code. Transform and opacity only, through the Web
// Animations API, so the browser can run it off the main thread; durations and curves come from the
// motion tokens; reduced motion collapses it to an instant change. Never animates layout.
import { duration, ease, reducedMotion, type DurationToken, type EaseToken } from "./tokens";
import { springEasing, type SpringOptions } from "./spring";

export interface Pose {
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  /** clip-path inset in px: top, right, bottom, left (+ optional corner radius). Paint only, no layout. */
  clip?: [number, number, number, number, number?];
}

export interface GlideOptions {
  duration?: DurationToken | number;
  ease?: EaseToken | string;
  /** Use a spring instead of duration + ease. `true` for the default spring. */
  spring?: boolean | SpringOptions;
  delay?: number;
  /** Keep the end pose applied after finishing (default: the element returns to its CSS). */
  hold?: boolean;
  origin?: string;
  /**
   * Keep the element's own CSS `transform` (an anchoring `translate(-50%, -100%)`, say) and move it
   * with the separate `translate` / `scale` properties instead. Same compositor path.
   */
  additive?: boolean;
}

export function poseTransform(p: Pose): string {
  const parts: string[] = [];
  if (p.x || p.y) parts.push(`translate(${p.x ?? 0}px, ${p.y ?? 0}px)`);
  const sx = p.scaleX ?? p.scale;
  const sy = p.scaleY ?? p.scale;
  if ((sx !== undefined && sx !== 1) || (sy !== undefined && sy !== 1)) parts.push(`scale(${sx ?? 1}, ${sy ?? 1})`);
  return parts.length ? parts.join(" ") : "none";
}

export function poseKeyframe(p: Pose, origin?: string, additive = false): Keyframe {
  const k: Keyframe = {};
  if (additive) {
    k.translate = `${p.x ?? 0}px ${p.y ?? 0}px`;
    k.scale = `${p.scaleX ?? p.scale ?? 1} ${p.scaleY ?? p.scale ?? 1}`;
  } else {
    k.transform = poseTransform(p);
  }
  if (p.opacity !== undefined) k.opacity = p.opacity;
  if (p.clip) k.clipPath = `inset(${p.clip[0]}px ${p.clip[1]}px ${p.clip[2]}px ${p.clip[3]}px${p.clip[4] ? ` round ${p.clip[4]}px` : ""})`;
  if (origin) k.transformOrigin = origin;
  return k;
}

export interface GlideHandle {
  finished: Promise<void>;
  cancel(): void;
  /** Run the same animation backwards from where it is now (interrupting a flow mid-way).
   *  Returns false when it had already finished (start a new animation instead). */
  reverse?(): boolean;
}

const DONE: GlideHandle = { finished: Promise.resolve(), cancel() {} };

/** Animate `el` from one pose to another. Resolves when done (also when cancelled or unsupported). */
export function glide(el: Element | null | undefined, from: Pose, to: Pose, opts: GlideOptions = {}): GlideHandle {
  if (!el || typeof (el as HTMLElement).animate !== "function") return DONE;
  const html = el as HTMLElement;
  if (reducedMotion()) {
    if (opts.hold) applyPose(html, to, opts.additive);
    return DONE;
  }
  let timing: KeyframeAnimationOptions;
  if (opts.spring) {
    const s = springEasing(opts.spring === true ? {} : opts.spring);
    timing = { duration: s.duration, easing: s.easing };
  } else {
    timing = { duration: duration(opts.duration ?? "base"), easing: ease(opts.ease ?? "out") };
  }
  let anim: Animation;
  try {
    anim = html.animate([poseKeyframe(from, opts.origin, opts.additive), poseKeyframe(to, opts.origin, opts.additive)], { ...timing, delay: opts.delay ?? 0, fill: opts.hold ? "both" : "backwards" });
  } catch {
    // An easing this engine build doesn't know (old WebView2 without linear()): fall back to ease-out.
    anim = html.animate([poseKeyframe(from, opts.origin, opts.additive), poseKeyframe(to, opts.origin, opts.additive)], { duration: duration("base"), easing: "cubic-bezier(0.22, 1, 0.36, 1)", delay: opts.delay ?? 0, fill: opts.hold ? "both" : "backwards" });
  }
  const finished = anim.finished.then(
    () => {
      if (opts.hold) {
        try {
          anim.commitStyles();
          anim.cancel();
        } catch {
          /* element left the page */
        }
      }
    },
    () => {}
  );
  return {
    finished,
    cancel: () => anim.cancel(),
    reverse: () => {
      try {
        if (anim.playState !== "running") return false;
        anim.reverse();
        return true;
      } catch {
        return false; // element left the page
      }
    },
  };
}

function applyPose(el: HTMLElement, p: Pose, additive = false) {
  const k = poseKeyframe(p, undefined, additive);
  if (additive) {
    el.style.setProperty("translate", String(k.translate));
    el.style.setProperty("scale", String(k.scale));
  } else {
    el.style.transform = String(k.transform ?? "");
  }
  if (k.opacity !== undefined) el.style.opacity = String(k.opacity);
  if (k.clipPath) el.style.clipPath = String(k.clipPath);
}

/** Remove a pose the engine left on an element (a held exit), so it returns to its CSS. */
export function clearPose(el: Element | null | undefined) {
  const style = (el as HTMLElement | null | undefined)?.style;
  if (!style) return;
  for (const prop of ["transform", "translate", "scale", "opacity", "clip-path"]) style.removeProperty(prop);
}

/** Enter: from slightly offset and transparent to rest. `from` defaults to the standard entry pose. */
export function glideIn(el: Element | null | undefined, from: Pose = { y: 6, scale: 0.96, opacity: 0 }, opts: GlideOptions = {}): GlideHandle {
  return glide(el, { opacity: 0, ...from }, { opacity: 1 }, { duration: "base", ease: "out", ...opts });
}

/** Exit: quicker than entering, ends transparent. Await `.finished`, then unmount or hide. */
export function glideOut(el: Element | null | undefined, to: Pose = { scale: 0.98, opacity: 0 }, opts: GlideOptions = {}): GlideHandle {
  return glide(el, { opacity: 1 }, { opacity: 0, ...to }, { duration: "exit", ease: "exit", hold: true, ...opts });
}
