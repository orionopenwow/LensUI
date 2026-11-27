// Applies Dock keys (src/dock/keys.ts) to the page: one keydown handler on the Dock, no listeners
// per icon and no timers while idle. Finding marks icons with data-find ("hit" / "miss") straight
// on the elements, so typing never re-renders the Dock; only the small find chip is React state.
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { FIND_IDLE_MS, dockKeyAction, findHits } from "../keys";
import type { DockEdge } from "../model";

const ICONS = ".dock-icons-row .dock-item";

/** An icon's name without its state ("Spotify (running), 2 windows" → "Spotify"). */
export const iconName = (el: Element) => (el.getAttribute("aria-label") ?? "").replace(/\s*\((focused|running)\).*$/, "").replace(/,\s*\d+\+? (notifications|windows)$/, "");

export function useDockKeys(pillRef: RefObject<HTMLElement | null>, edge: DockEdge, openWindows: (icon: HTMLElement) => boolean) {
  const [find, setFind] = useState<{ query: string; found: boolean } | null>(null);
  const state = useRef<{ query: string; idle: number }>({ query: "", idle: 0 });

  const icons = () => Array.from(pillRef.current?.querySelectorAll<HTMLElement>(ICONS) ?? []);
  const mark = (query: string) => {
    const all = icons();
    const hits = query ? findHits(all.map(iconName), query) : [];
    all.forEach((el, i) => {
      const wrap = el.closest<HTMLElement>(".dock-item-wrap");
      if (!wrap) return;
      if (query) wrap.dataset.find = hits[i] ? "hit" : "miss";
      else delete wrap.dataset.find;
    });
  };
  const clear = () => {
    window.clearTimeout(state.current.idle);
    if (!state.current.query) return;
    state.current.query = "";
    mark("");
    setFind(null);
  };
  useEffect(() => () => window.clearTimeout(state.current.idle), []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    // Only with an icon focused: the search field, menus and cards keep their own keys.
    if (!target.matches?.(ICONS)) return;
    const all = icons();
    const action = dockKeyAction({
      key: e.key,
      modified: e.ctrlKey || e.altKey || e.metaKey,
      edge,
      index: all.indexOf(target),
      count: all.length,
      names: all.map(iconName),
      query: state.current.query,
    });
    if (e.key === "Enter") clear();
    if (!action) return;
    if (action.kind === "windows") {
      clear();
      if (openWindows(target)) e.preventDefault();
      return;
    }
    e.preventDefault();
    // Esc that only ends a find must not also close what else listens for it.
    if (action.kind === "clear") e.stopPropagation();
    if (action.kind === "move") {
      clear();
      all[action.to]?.focus({ preventScroll: true });
      return;
    }
    if (action.kind === "clear") {
      clear();
      return;
    }
    state.current.query = action.query;
    mark(action.query);
    setFind({ query: action.query, found: action.to >= 0 });
    if (action.to >= 0) all[action.to].focus({ preventScroll: true });
    window.clearTimeout(state.current.idle);
    state.current.idle = window.setTimeout(clear, FIND_IDLE_MS);
  };

  return {
    onKeyDown,
    /** Focus left the Dock's icons: stop finding. */
    onBlur: (e: { relatedTarget: EventTarget | null }) => {
      if (!(e.relatedTarget instanceof Element) || !e.relatedTarget.matches(ICONS)) clear();
    },
    find,
  };
}
