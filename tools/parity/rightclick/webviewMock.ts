// The gallery runs outside Tauri: a webview whose zoom calls do nothing.
export function getCurrentWebview() {
  return { setZoom: async () => {}, label: "parity" };
}
