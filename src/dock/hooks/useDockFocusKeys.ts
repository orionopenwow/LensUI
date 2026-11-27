// "Focus the Dock" (func.dockFocusHotkey, src-tauri/src/app/dock_keys.rs): the hotkey gives the
// Dock the foreground and sends lens://dock-keys-focus; this puts the focus ring on an icon so
// Dock keys (useDockKeys) work at once. Esc on an icon leaves and gives the foreground back;
// Enter opens the app (which takes the foreground, so Lens Core ends the session by itself).
// No timers but the hint's, no re-render per key: the ring is a data attribute on the pill.
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logFail } from "../../failsafe/calls";
import { dockArrows } from "../keys";
import type { DockEdge } from "../model";

const ICONS = ".dock-icons-row .dock-item";
/** Where focus may go without leaving keys mode: the pill, the hover card, the Dock's menu. */
const INSIDE = ".dock-pill, .dock-hover-card, .dock-ctx-menu, [role=menu]";
export const KEYS_HINT_MS = 2600;

/** The hint shown when the hotkey lands: the arrows that run along this edge. */
export function keysHint(edge: DockEdge): string {
  const a = dockArrows(edge);
  const glyph = (k: string) => ({ ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" })[k] ?? k;
  return `${glyph(a.prev)} ${glyph(a.next)} to move · Enter to open · Esc to leave`;
}

/** The icon the hotkey lands on: the app in front before the hotkey (it is marked focused), else the first. */
export function landingIcon(icons: readonly HTMLElement[]): HTMLElement | null {
  return icons.find((el) => el.classList.contains("is-focused")) ?? icons[0] ?? null;
}

const leave = (restore: boolean) => invoke("dock_keys_leave_cmd", { restore }).catch(logFail("Dock", "give the keyboard back"));

export function useDockFocusKeys(pillRef: RefObject<HTMLElement | null>, edge: DockEdge) {
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef(0);
  const edgeRef = useRef(edge);
  edgeRef.current = edge;

  useEffect(() => {
    const off = () => {
      const pill = pillRef.current;
      if (pill) delete pill.dataset.keys;
      window.clearTimeout(timer.current);
      setHint(null);
    };
    const on = listen("lens://dock-keys-focus", () => {
      const pill = pillRef.current;
      if (!pill) return;
      const icon = landingIcon(Array.from(pill.querySelectorAll<HTMLElement>(ICONS)));
      if (!icon) return;
      pill.dataset.keys = "";
      icon.focus({ preventScroll: true });
      setHint(keysHint(edgeRef.current));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setHint(null), KEYS_HINT_MS);
    });
    const left = listen("lens://dock-keys-left", off);
    window.addEventListener("blur", off);
    return () => {
      on.then((fn) => fn());
      left.then((fn) => fn());
      window.removeEventListener("blur", off);
      window.clearTimeout(timer.current);
    };
  }, [pillRef]);

  const active = () => pillRef.current?.dataset.keys !== undefined;

  return {
    hint,
    /** Runs after Dock keys: Esc that nothing else took leaves, Enter hands over to the app. */
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!active() || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (!target.matches?.(ICONS)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        target.blur();
        void leave(true);
      } else if (e.key === "Enter" || e.key === " ") {
        setHint(null);
        void leave(false);
      } else {
        setHint(null);
      }
    },
    /** Focus moved somewhere that isn't the Dock: keys mode ends (Lens Core keeps the foreground rules). */
    onBlur: (e: { relatedTarget: EventTarget | null }) => {
      if (!active()) return;
      const to = e.relatedTarget;
      if (to instanceof Element && to.closest(INSIDE)) return;
      if (to === null) return; // the window itself lost focus: the window blur handles it
      const pill = pillRef.current;
      if (pill) delete pill.dataset.keys;
      setHint(null);
      void leave(false);
    },
  };
}
