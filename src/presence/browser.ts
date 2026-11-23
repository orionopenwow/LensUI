// Lens Browser's page agent → "Lens at work". Page elements come with viewport rects from
// page_agent.js; the page webview sits over `.lb-page` in the browser window, so window CSS px =
// page rect + that box's offset. presence_announce then converts window CSS px → screen px
// (window origin × scale factor; see geom::page_to_screen). Docs: docs/PRESENCE.md.
import type { PageAction, PageSnapshot } from "../browser/api";
import { announce, type AnnounceResult } from "./api";
import type { LRect, StepInput } from "./types";

/** Page viewport rect [x, y, w, h] → browser-window CSS rect, clipped to the page box. */
export function pageToWindow(rect: [number, number, number, number], host: { left: number; top: number; width: number; height: number }): LRect | null {
  const [x, y, w, h] = rect.map((n) => (Number.isFinite(n) ? n : 0));
  if (w <= 0 || h <= 0) return null;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(host.width, x + w);
  const bottom = Math.min(host.height, y + h);
  if (right <= left || bottom <= top) return null; // scrolled out of view
  return { x: host.left + left, y: host.top + top, w: right - left, h: bottom - top };
}

const quote = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim().slice(0, 40);
  return t ? `‘${t}’` : "";
};

/** Step shown for one page action (labels are short; typed text is masked by the backend). */
export function pageStepInput(action: PageAction, name: string, secret: boolean): StepInput {
  switch (action.do) {
    case "click":
      return { kind: "click", label: `Clicking ${quote(name) || "a link"}` };
    case "submit":
      return { kind: "click", label: `Submitting ${quote(name) || "the form"}` };
    case "type":
      return { kind: "type", label: `Typing into ${quote(name) || "a field"}`, text: action.text, secret };
    case "select":
      return { kind: "click", label: `Choosing ${quote(action.value)}` };
    case "navigate":
      return { kind: "travel", label: "Opening a page" };
    case "search":
      return { kind: "travel", label: `Searching ${quote(action.query)}` };
    case "scroll":
      return { kind: "travel", label: "Scrolling" };
    default:
      return { kind: "travel", label: "Reading the page" };
  }
}

export async function pageStep(action: PageAction, element: number | undefined, snap: PageSnapshot | null): Promise<AnnounceResult> {
  const el = element != null ? snap?.elements.find((e) => e.ref === element) : undefined;
  const hostEl = typeof document !== "undefined" ? document.querySelector(".lb-page") : null;
  const host = hostEl?.getBoundingClientRect();
  const target = el && host ? pageToWindow(el.rect, host) : null;
  const secret = !!el && (el.inputType === "password" || /password|cc-|card/.test(el.autocomplete));
  const name = el ? el.label || el.name || el.text : "";
  return announce("internal", pageStepInput(action, name, secret), target);
}
