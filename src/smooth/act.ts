// Scripted DOM actions for the smoothness check: the probe in the target surface performs them.
// They drive the same handlers a real pointer or key would (synthetic events), so the measured
// animation is the real one. Missing elements are skipped: the runner reports the step as such.

export interface DomAct {
  surface: string;
  kind: "click" | "hover" | "unhover" | "sweep" | "context" | "key" | "type" | "scroll";
  /** First match wins; several comma-separated candidates are fine. */
  selector?: string;
  /** Which match to use when the selector hits several (default 0; negative counts from the end). */
  nth?: number;
  key?: string;
  text?: string;
  /** Sweep or scroll duration in ms. */
  ms?: number;
}

function pick(selector: string | undefined, nth = 0): HTMLElement | null {
  if (!selector) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return all.at(nth) ?? null;
}

function mouse(el: Element, type: string, x: number, y: number, extra: MouseEventInit = {}) {
  const init: MouseEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, ...extra };
  const Ctor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Ctor(type, init));
}

const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export function performAct(a: DomAct): boolean {
  switch (a.kind) {
    case "click": {
      const el = pick(a.selector, a.nth);
      if (!el) return false;
      const { x, y } = centre(el);
      mouse(el, "pointerdown", x, y);
      mouse(el, "mousedown", x, y);
      mouse(el, "pointerup", x, y);
      mouse(el, "mouseup", x, y);
      el.click();
      return true;
    }
    case "hover": {
      const el = pick(a.selector, a.nth);
      if (!el) return false;
      const { x, y } = centre(el);
      for (const t of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) mouse(el, t, x, y, { bubbles: !t.endsWith("enter") });
      return true;
    }
    case "unhover": {
      const el = pick(a.selector, a.nth);
      if (!el) return false;
      const { x, y } = centre(el);
      for (const t of ["pointerout", "pointerleave", "mouseout", "mouseleave"]) mouse(el, t, x, y - 400, { bubbles: !t.endsWith("leave"), relatedTarget: document.body });
      return true;
    }
    case "sweep": {
      // Glide the pointer across the element left to right and back (Dock magnification).
      const el = pick(a.selector, a.nth);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const ms = a.ms ?? 1200;
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        const tri = p < 0.5 ? p * 2 : 2 - p * 2;
        const x = r.left + 8 + (r.width - 16) * tri;
        const under = document.elementFromPoint(x, y) ?? el;
        mouse(under, "pointermove", x, y);
        mouse(under, "mousemove", x, y);
        if (p < 1) requestAnimationFrame(step);
        else for (const t of ["pointerleave", "mouseleave"]) mouse(el, t, x, y - 400, { bubbles: false, relatedTarget: document.body });
      };
      const first = document.elementFromPoint(r.left + 8, y) ?? el;
      mouse(first, "pointerenter", r.left + 8, y, { bubbles: false });
      mouse(el, "mouseenter", r.left + 8, y, { bubbles: false });
      requestAnimationFrame(step);
      return true;
    }
    case "context": {
      const el = pick(a.selector, a.nth);
      if (!el) return false;
      const { x, y } = centre(el);
      mouse(el, "contextmenu", x, y, { button: 2 });
      return true;
    }
    case "key": {
      const target = (document.activeElement as HTMLElement | null) ?? document.body;
      const init: KeyboardEventInit = { key: a.key ?? "Escape", bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent("keydown", init));
      window.dispatchEvent(new KeyboardEvent("keydown", init));
      target.dispatchEvent(new KeyboardEvent("keyup", init));
      return true;
    }
    case "type": {
      const el = pick(a.selector, a.nth) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return false;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, a.text ?? "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    case "scroll": {
      const el = pick(a.selector, a.nth);
      if (!el) return false;
      el.scrollBy({ top: 600, behavior: "smooth" });
      window.setTimeout(() => el.scrollBy({ top: -600, behavior: "smooth" }), (a.ms ?? 900) / 2);
      return true;
    }
  }
  return false;
}
