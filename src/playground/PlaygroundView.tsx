import "./playground.css";
import React, { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createRunner, type Runner, type RunnerStats } from "./runner";
import { readPalette, watchPalette } from "./palette";
import { sceneById } from "./registry";
import { normaliseOptions, type DesktopInputEvent, type PointerSample, type SceneOptions } from "./types";
import { b64ToBytes, bytesToB64 } from "./util";

export interface PlaygroundViewProps {
  sceneId: string;
  options?: SceneOptions;
  fps?: number;
  /** Stop the loop entirely (covered / battery / fullscreen / hidden preview). */
  paused?: boolean;
  /** Draw a single still frame (Calm, reduced motion). */
  still?: boolean;
  ripples?: boolean;
  /** Small gallery preview: fewer particles, DOM pointer input, no persistence. */
  preview?: boolean;
  /** Listen to lens://desktop-input (the wallpaper behind the icons). */
  desktopInput?: boolean;
  /** Take pointer input from the page itself (previews, idle mode). */
  domInput?: boolean;
  /** Save / restore scene state in %APPDATA%\LensUI\playground (falling sand). */
  persist?: boolean;
  seed?: number;
  dprCap?: number;
  onStats?: (s: RunnerStats) => void;
  /** Exposes the runner (tests / screenshots / card "Clear" button). */
  onRunner?: (r: Runner | null) => void;
  className?: string;
  style?: React.CSSProperties;
}

/** True when Lens or Windows asks for reduced motion (Lens' own setting wins). */
export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const lens = document.documentElement.dataset.motion;
  if (lens === "reduce") return true;
  if (lens === "full") return false;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Hosts one Playground scene: canvas + ripple overlay, theme palette, input, pause and
 * reduced motion. Mount with `key={sceneId}` semantics: a new scene gets a fresh canvas (a
 * canvas can't switch between WebGL and 2D).
 */
export const PlaygroundView: React.FC<PlaygroundViewProps> = (props) => {
  const { sceneId, preview = false } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<Runner | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Create / destroy the runner when the scene changes.
  useEffect(() => {
    const host = hostRef.current;
    const module = sceneById(sceneId);
    if (!host || !module) return;
    const canvas = document.createElement("canvas");
    canvas.className = "pg-canvas";
    const overlay = document.createElement("canvas");
    overlay.className = "pg-overlay";
    host.append(canvas, overlay);
    const p = propsRef.current;
    const reduced = prefersReducedMotion();
    let runner: Runner;
    try {
      runner = createRunner({
        canvas,
        overlay,
        module,
        options: normaliseOptions(module, p.options),
        palette: readPalette(),
        fps: p.fps ?? 30,
        seed: p.seed,
        preview,
        still: !!p.still || reduced,
        ripples: !!p.ripples,
        dprCap: p.dprCap ?? (preview ? 1 : 1.25),
        onStats: (s) => propsRef.current.onStats?.(s),
        persist:
          p.persist && module.id === "sand"
            ? {
                load: () =>
                  invoke<string | null>("load_playground_state_cmd", { scene: module.id }).then((b) =>
                    b ? b64ToBytes(b) : null
                  ),
                save: (bytes) => invoke("save_playground_state_cmd", { scene: module.id, data: bytesToB64(bytes) }).then(() => {}),
              }
            : null,
      });
    } catch {
      canvas.remove();
      overlay.remove();
      return;
    }
    runner.setPaused(!!p.paused || (typeof document !== "undefined" && document.hidden));
    runnerRef.current = runner;
    p.onRunner?.(runner);

    const unPalette = watchPalette((pal) => runner.setPalette(pal));
    const onVis = () => runner.setPaused(!!propsRef.current.paused || document.hidden);
    document.addEventListener("visibilitychange", onVis);
    const motionObs = new MutationObserver(() => runner.setStill(!!propsRef.current.still || prefersReducedMotion()));
    motionObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    const onMq = () => runner.setStill(!!propsRef.current.still || prefersReducedMotion());
    mq?.addEventListener?.("change", onMq);

    // Desktop input (normalised 0..1 of the primary monitor -> this window's CSS pixels).
    let unDesktop: (() => void) | null = null;
    let cancelled = false;
    if (p.desktopInput) {
      listen<DesktopInputEvent>("lens://desktop-input", (e) => {
        const d = e.payload;
        const r = host.getBoundingClientRect();
        runner.push({
          kind: d.kind,
          x: d.x * r.width,
          y: d.y * r.height,
          button: d.button,
          buttons: d.buttons,
          delta: d.delta,
          alt: d.alt,
        });
      }).then((un) => {
        if (cancelled) un();
        else unDesktop = un;
      });
    }

    // Page pointer input (previews and idle mode).
    const domHandlers: [string, (e: Event) => void][] = [];
    if (p.domInput) {
      const sample = (kind: PointerSample["kind"], e: PointerEvent | WheelEvent): PointerSample => {
        const r = host.getBoundingClientRect();
        return {
          kind,
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          button: kind === "down" || kind === "up" ? (e as PointerEvent).button : -1,
          buttons: (e as PointerEvent).buttons ?? 0,
          delta: kind === "wheel" ? -Math.sign((e as WheelEvent).deltaY) : 0,
          alt: e.altKey,
        };
      };
      domHandlers.push(
        ["pointermove", (e) => runner.push(sample("move", e as PointerEvent))],
        ["pointerdown", (e) => {
          (e.target as Element).setPointerCapture?.((e as PointerEvent).pointerId);
          runner.push(sample("down", e as PointerEvent));
        }],
        ["pointerup", (e) => runner.push(sample("up", e as PointerEvent))],
        ["pointerleave", (e) => runner.push(sample("leave", e as PointerEvent))],
        ["wheel", (e) => runner.push(sample("wheel", e as WheelEvent))],
        ["contextmenu", (e) => e.preventDefault()]
      );
      for (const [n, h] of domHandlers) host.addEventListener(n, h, { passive: n !== "contextmenu" });
    }

    return () => {
      cancelled = true;
      unDesktop?.();
      for (const [n, h] of domHandlers) host.removeEventListener(n, h);
      unPalette();
      document.removeEventListener("visibilitychange", onVis);
      motionObs.disconnect();
      mq?.removeEventListener?.("change", onMq);
      runner.dispose();
      runnerRef.current = null;
      propsRef.current.onRunner?.(null);
      canvas.remove();
      overlay.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, preview, props.desktopInput, props.domInput, props.persist]);

  // Live updates without recreating the scene.
  const optionsKey = JSON.stringify(props.options ?? {});
  useEffect(() => {
    const r = runnerRef.current;
    const m = sceneById(sceneId);
    if (r && m) r.setOptions(normaliseOptions(m, props.options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);
  useEffect(() => runnerRef.current?.setFps(props.fps ?? 30), [props.fps]);
  useEffect(() => runnerRef.current?.setPaused(!!props.paused || document.hidden), [props.paused]);
  useEffect(() => runnerRef.current?.setStill(!!props.still || prefersReducedMotion()), [props.still]);
  useEffect(() => runnerRef.current?.setRipples(!!props.ripples), [props.ripples]);

  return <div ref={hostRef} className={`pg-host ${props.className ?? ""}`} style={props.style} aria-hidden="true" />;
};
