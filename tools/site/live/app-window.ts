// The website's stand-in for @tauri-apps/api/window inside a demo window. Each real surface runs in a
// same-origin iframe owned by the page's desk (docs/site/js/desk.js); what the surface asks its
// window to do (close, minimise, maximise, hide, start a drag) is passed to the desk, which does it
// to the demo window. Everything else is a no-op, as in the parity harness.
const noop = async () => {};
const toDesk = (a: string) => async () => { try { window.parent?.postMessage({ lens: "win", a }, location.origin); } catch { /* no host */ } };
const ACTIONS: Record<string, string> = { close: "close", destroy: "close", hide: "hide", minimize: "min", toggleMaximize: "max", maximize: "max", unmaximize: "max", startDragging: "drag", setFocus: "focus" };
export function getCurrentWindow() {
  return new Proxy({}, {
    get: (_t, k) => (k === "label" ? "harness" : k === "onFocusChanged" || k === "onResized" || k === "onMoved" || k === "listen" ? async () => () => {} : typeof k === "string" && ACTIONS[k] ? toDesk(ACTIONS[k]) : noop),
  });
}
