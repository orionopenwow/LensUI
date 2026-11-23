// In-app twin: inside a Lens window (Settings / Control Center), when Lens or Claude changes a
// setting the small orb glides to the real control (Guide `data-guide-id` anchors, falling back
// to the visible label like CoachMarkLayer), rings it and flips it. Esc stops the run.
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { findTarget, openSection } from "../guide/coach";
import { ORB_URL } from "./orb";
import { twinAnchor } from "./model";
import { stop } from "./api";
import { EVT_STOP, EVT_UI, type UiEvent } from "./types";
import "./presence.css";

interface TwinState {
  x: number;
  y: number;
  ring: { x: number; y: number; w: number; h: number } | null;
  chip: string;
  visible: boolean;
}

const HIDE_MS = 2600;

/** Find the control for "Theme → Nord" in this window. */
export function locate(root: ParentNode, setting: string): HTMLElement | null {
  const name = setting.split("→")[0].trim();
  const anchor = twinAnchor(setting) ?? undefined;
  return findTarget(root, { surface: "settings", anchor: anchor ? `settings.${anchor}` : undefined, label: name }) ?? (anchor ? findTarget(root, { surface: "settings", anchor }) : null);
}

export function PresenceTwin({ still = false }: { still?: boolean }) {
  const [st, setSt] = useState<TwinState | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(false);

  useEffect(() => {
    const show = (ev: UiEvent) => {
      const setting = ev.settings[0] ?? ev.label;
      if (!setting) return;
      openSection(document, twinAnchor(setting) ?? undefined);
      const el = locate(document, setting);
      if (!el) return;
      el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
      const r = el.getBoundingClientRect();
      const ring = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 };
      setSt((prev) => ({
        // First appearance: start just off the ring's top-right, then glide in.
        x: prev?.visible ? prev.x : r.right + 40,
        y: prev?.visible ? prev.y : r.top - 30,
        ring: null,
        chip: ev.settings.join(" · ") || ev.label,
        visible: true,
      }));
      requestAnimationFrame(() => setSt((s) => (s ? { ...s, x: r.left + r.width / 2, y: r.top + r.height / 2, ring } : s)));
      el.classList.remove("pr-flip");
      void el.offsetWidth;
      el.classList.add("pr-flip");
      active.current = true;
      clearTimeout(hide.current);
      hide.current = setTimeout(() => {
        active.current = false;
        setSt((s) => (s ? { ...s, visible: false, ring: null } : s));
        el.classList.remove("pr-flip");
      }, HIDE_MS);
    };
    const onLocal = (e: Event) => show((e as CustomEvent<UiEvent>).detail);
    window.addEventListener(EVT_UI, onLocal);
    const un1 = listen<UiEvent>(EVT_UI, (e) => show(e.payload));
    const un2 = listen<string[]>(EVT_STOP, () => {
      active.current = false;
      setSt(null);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active.current) void stop();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(hide.current);
      window.removeEventListener(EVT_UI, onLocal);
      window.removeEventListener("keydown", onKey);
      void un1.then((u) => u());
      void un2.then((u) => u());
    };
  }, [still]);

  if (!st) return null;
  return (
    <div className={`pr-twin${still ? " is-still" : ""}`} aria-hidden="true">
      {st.ring ? <div className="pr-twin-ring" style={{ left: st.ring.x, top: st.ring.y, width: st.ring.w, height: st.ring.h }} /> : null}
      <div className="pr-twin-orb" style={{ left: st.x, top: st.y, opacity: st.visible ? 1 : 0 }}>
        <img src={ORB_URL} alt="" draggable={false} />
      </div>
      {st.ring && st.visible ? (
        <div className="pr-chip is-setting pr-twin-chip" style={{ left: st.ring.x + st.ring.w + 8, top: st.ring.y + st.ring.h / 2 }}>
          {st.chip}
        </div>
      ) : null}
    </div>
  );
}
