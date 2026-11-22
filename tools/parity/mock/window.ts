const noop = async () => {};
export function getCurrentWindow() {
  return new Proxy({}, { get: (_t, k) => (k === "label" ? "harness" : k === "onFocusChanged" ? async () => () => {} : noop) });
}
