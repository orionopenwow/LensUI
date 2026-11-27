// One listener set per window drives every press (DESIGN.md §5.2): no per-control handlers, no
// React state, no re-renders while pressing. Attributes only (data-press), so the browser does the
// rest on the compositor (scale / translate) and in one cheap paint (the fill step).
import { pressMs, releaseMs } from "../motion/tokens";
import { PressMachine, type PressClock, type PressTiming } from "./machine";
import { CLASS_SELECTOR, classWeight } from "./weights";

const PRESSABLE = `[data-weight], ${CLASS_SELECTOR}`;

const clock: PressClock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
const timing: PressTiming = { holdMin: () => pressMs("press-hold-min"), release: (w) => releaseMs(w) };

const machines = new WeakMap<Element, PressMachine>();

export function machineFor(el: Element): PressMachine {
  let m = machines.get(el);
  if (!m) {
    m = new PressMachine(el, clock, timing);
    machines.set(el, m);
  }
  return m;
}

/** The pressable control an event landed in, given a weight from its class if it has none. */
export function pressableFrom(target: EventTarget | null): Element | null {
  const start = target instanceof Element ? target : (target as Node | null)?.parentElement ?? null;
  const el = start?.closest(PRESSABLE) ?? null;
  if (!el) return null;
  if (el.closest("[data-no-press]")) return null;
  if (!el.hasAttribute("data-weight")) {
    const w = classWeight((s) => el.matches(s));
    if (!w) return null;
    el.setAttribute("data-weight", w);
  }
  return el;
}

const installed = new WeakSet<Document>();

/** Install the press listeners on a document (idempotent). Returns an uninstall function. */
export function installPress(doc: Document | undefined = typeof document !== "undefined" ? document : undefined): () => void {
  if (!doc || installed.has(doc)) return () => {};
  installed.add(doc);
  const byPointer = new Map<number, Element>();
  let byKey: Element | null = null;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = pressableFrom(e.target);
    if (el && machineFor(el).down()) byPointer.set(e.pointerId, el);
  };
  const onUp = (e: PointerEvent) => {
    const el = byPointer.get(e.pointerId);
    if (!el) return;
    byPointer.delete(e.pointerId);
    machineFor(el).up();
  };
  const onCancel = (e: PointerEvent) => {
    const el = byPointer.get(e.pointerId);
    if (!el) return;
    byPointer.delete(e.pointerId);
    machineFor(el).cancel();
  };
  const onOut = (e: PointerEvent) => {
    const el = byPointer.get(e.pointerId);
    if (!el) return;
    const to = e.relatedTarget as Node | null;
    if (to && el.contains(to)) return;
    byPointer.delete(e.pointerId);
    machineFor(el).cancel();
  };
  const isPressKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";
  const onKeyDown = (e: KeyboardEvent) => {
    if (!isPressKey(e) || e.repeat) return;
    // Only the focused control itself: Enter in a field inside a card never presses the card.
    const el = pressableFrom(e.target);
    if (!el || el !== e.target) return;
    if (machineFor(el).down()) byKey = el;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!isPressKey(e) || !byKey) return;
    const el = byKey;
    byKey = null;
    machineFor(el).up();
  };
  const onBlur = (e: FocusEvent) => {
    if (byKey && e.target === byKey) {
      machineFor(byKey).cancel();
      byKey = null;
    }
  };

  const opts = { capture: true, passive: true } as const;
  doc.addEventListener("pointerdown", onDown, opts);
  doc.addEventListener("pointerup", onUp, opts);
  doc.addEventListener("pointercancel", onCancel, opts);
  doc.addEventListener("pointerout", onOut, opts);
  doc.addEventListener("keydown", onKeyDown, opts);
  doc.addEventListener("keyup", onKeyUp, opts);
  doc.addEventListener("focusout", onBlur, opts);
  return () => {
    installed.delete(doc);
    doc.removeEventListener("pointerdown", onDown, opts);
    doc.removeEventListener("pointerup", onUp, opts);
    doc.removeEventListener("pointercancel", onCancel, opts);
    doc.removeEventListener("pointerout", onOut, opts);
    doc.removeEventListener("keydown", onKeyDown, opts);
    doc.removeEventListener("keyup", onKeyUp, opts);
    doc.removeEventListener("focusout", onBlur, opts);
  };
}
