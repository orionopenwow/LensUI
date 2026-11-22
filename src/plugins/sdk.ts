/**
 * The script injected at the top of every plugin document. It only wraps postMessage;
 * nothing here is trusted by the host, which re-checks every request.
 * Plugin authors use:  lens.request(method, params) -> Promise,  lens.on(event, cb),  lens.theme
 */
export const PLUGIN_SDK_SOURCE = `
(function () {
  "use strict";
  // Remove APIs that could reach the network around the CSP (WebRTC uses STUN directly).
  ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "WebTransport"].forEach(function (k) {
    try { delete window[k]; } catch (e) {}
    try { Object.defineProperty(window, k, { value: undefined, configurable: false, writable: false }); } catch (e) {}
  });
  var nextId = 1, pending = {}, listeners = {};
  var parentWin = window.parent;
  window.addEventListener("message", function (ev) {
    if (ev.source !== parentWin) return;
    var m = ev.data;
    if (!m || m.__lens !== 1) return;
    if (typeof m.event === "string") {
      if (m.event === "theme" && m.data) window.lens.theme = m.data;
      (listeners[m.event] || []).slice().forEach(function (cb) { try { cb(m.data); } catch (e) { console.error(e); } });
      return;
    }
    var p = pending[m.id];
    if (!p) return;
    delete pending[m.id];
    if (m.ok) p.resolve(m.result); else p.reject(new Error(String(m.error || "error")));
  });
  var api = {
    theme: null,
    request: function (method, params) {
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        pending[id] = { resolve: resolve, reject: reject };
        parentWin.postMessage({ __lens: 1, id: id, method: String(method), params: params === undefined ? null : params }, "*");
        setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error("timeout")); } }, 10000);
      });
    },
    on: function (event, cb) { (listeners[event] = listeners[event] || []).push(cb); },
  };
  Object.defineProperty(window, "lens", { value: api, writable: false, configurable: false });
})();
`;
