// Presence: keeps a child mounted while it leaves, so exits glide instead of vanishing.
// usePresence(show) → { mounted, ref }: render while `mounted`; the element under `ref` glides in
// when it appears and out before it is removed. PresenceList does the same for keyed lists and
// moves the survivors into place (FLIP) when one leaves.
import React, { useLayoutEffect, useRef, useState } from "react";
import { clearPose, glideIn, glideOut, type GlideHandle, type GlideOptions, type Pose } from "./glide";
import { captureFlip } from "./flip";

export interface PresenceOptions {
  enter?: Pose;
  exit?: Pose;
  enterOptions?: GlideOptions;
  exitOptions?: GlideOptions;
  /** Skip the entry animation on the first render (already-open content on page load). */
  initial?: boolean;
  /** False when CSS already animates the entry (an existing keyframe): only the exit is added. */
  animateEnter?: boolean;
}

export function usePresence<T extends HTMLElement = HTMLDivElement>(show: boolean, opts: PresenceOptions = {}) {
  const ref = useRef<T>(null);
  const [mounted, setMounted] = useState(show);
  const first = useRef(true);
  const run = useRef(0);
  const leaving = useRef<GlideHandle | null>(null);

  if (show && !mounted) setMounted(true);

  useLayoutEffect(() => {
    const id = ++run.current;
    const skip = first.current && opts.initial === false;
    first.current = false;
    if (show) {
      // Shown again while it was still gliding out: drop the exit and glide back in from there.
      const interrupted = !!leaving.current;
      if (interrupted) {
        leaving.current?.cancel();
        leaving.current = null;
        clearPose(ref.current);
      }
      if (interrupted || (!skip && opts.animateEnter !== false)) glideIn(ref.current, opts.enter, opts.enterOptions);
      return;
    }
    if (!mounted) return;
    const exit = glideOut(ref.current, opts.exit, opts.exitOptions);
    leaving.current = exit;
    exit.finished.then(() => {
      if (run.current !== id) return;
      leaving.current = null;
      setMounted(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, mounted]);

  return { mounted, ref };
}

/**
 * For `{value && <Popover value={value} />}` patterns: keeps the last value on screen while the
 * popover glides out. Render while `mounted`, read from `value`, and mark it inert when `leaving`.
 */
export function useLingering<T, E extends HTMLElement = HTMLDivElement>(value: T | null | undefined | false, opts: PresenceOptions = {}) {
  const last = useRef<T | null>(null);
  if (value) last.current = value;
  const { mounted, ref } = usePresence<E>(!!value, opts);
  return { value: (value || last.current) as T | null, mounted, ref, leaving: !value && mounted };
}

export interface PresenceListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  children: (item: T, state: { leaving: boolean }) => React.ReactElement;
  enter?: Pose;
  exit?: Pose;
  /** Wrapper element class (the list container). */
  className?: string;
  itemClassName?: string;
}

/** A keyed list whose items glide in, glide out before removal, and whose survivors slide to close gaps. */
export function PresenceList<T>({ items, getKey, children, enter, exit, className, itemClassName }: PresenceListProps<T>) {
  const [rendered, setRendered] = useState<{ key: string; item: T; leaving: boolean }[]>(() => items.map((item) => ({ key: getKey(item), item, leaving: false })));
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const seen = useRef(new Set<string>(items.map(getKey)));
  const boxRef = useRef<HTMLDivElement>(null);
  const pendingFlip = useRef<ReturnType<typeof captureFlip> | null>(null);

  // Reconcile: new items are added, missing ones are marked leaving (and removed after their exit).
  useLayoutEffect(() => {
    const want = new Map(items.map((i) => [getKey(i), i]));
    setRendered((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (want.has(r.key)) {
          const item = want.get(r.key) as T;
          if (r.leaving || r.item !== item) changed = true;
          return { key: r.key, item, leaving: false };
        }
        if (!r.leaving) changed = true;
        return r.leaving ? r : { ...r, leaving: true };
      });
      for (const [key, item] of want) {
        if (!prev.some((r) => r.key === key)) {
          next.push({ key, item, leaving: false });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useLayoutEffect(() => {
    // Survivors glide into the space a removed item left.
    pendingFlip.current?.play({ mode: "move", duration: "base" });
    pendingFlip.current = null;
    for (const r of rendered) {
      const el = nodes.current.get(r.key);
      if (!el) continue;
      if (!r.leaving && !seen.current.has(r.key)) {
        seen.current.add(r.key);
        glideIn(el, enter);
      } else if (r.leaving && el.dataset.leaving !== "1") {
        el.dataset.leaving = "1";
        glideOut(el, exit).finished.then(() => {
          pendingFlip.current = captureFlip(Array.from(nodes.current.entries()).filter(([k]) => k !== r.key).map(([, n]) => n));
          seen.current.delete(r.key);
          setRendered((prev) => prev.filter((x) => x.key !== r.key || !x.leaving));
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

  return (
    <div ref={boxRef} className={className}>
      {rendered.map((r) => (
        <div
          key={r.key}
          className={itemClassName}
          ref={(el) => {
            if (el) nodes.current.set(r.key, el);
            else nodes.current.delete(r.key);
          }}
        >
          {children(r.item, { leaving: r.leaving })}
        </div>
      ))}
    </div>
  );
}
