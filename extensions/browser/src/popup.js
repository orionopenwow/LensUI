// Popup = Lens Mini for the current tab.
import { isYoutubeVideoUrl } from "./youtube.js";
const api = globalThis.browser ?? globalThis.chrome;
const D = globalThis.LensDash;
const L = globalThis.LensSel;

const listeners = new Set();
api.runtime.onMessage.addListener((m) => {
  for (const fn of listeners) fn(m);
});

const settingsP = api.storage.local.get("lensSettings").then((r) => L.sanitizeSettings(r.lensSettings));
const tabP = api.tabs.query({ active: true, currentWindow: true }).then(([t]) => t);

const dash = D.mount(document.getElementById("app"), {
  surface: "popup",
  logo: "../icons/icon32.png",
  showRecent: true,
  defaultAction: undefined,
  send: (msg) => api.runtime.sendMessage(msg),
  listen: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getContext: () => api.runtime.sendMessage({ type: "page-context" }),
  onOpened: () => setTimeout(() => window.close(), 150),
});

api.runtime.sendMessage({ type: "theme" }).then((r) => {
  if (r?.theme?.bg) document.body.style.background = r.theme.bg;
}).catch(() => {});

// Per-site selection button + links, under the tiles.
(async () => {
  const [settings, tab] = await Promise.all([settingsP, tabP]);
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    Object.assign(e, props);
    e.append(...kids);
    return e;
  };
  const host = L.normalizeHost(tab?.url || "");
  const denied = tab?.url ? L.isDeniedUrl(tab.url, settings.never) : { denied: true, reason: "not a web page" };
  const on = !!tab?.url && L.buttonEnabledFor(settings, tab.url);
  const sw = el("button", { className: "l-switch" });
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", String(on));
  sw.setAttribute("aria-label", "Selection button on this site");
  if (denied.denied || !host) sw.setAttribute("aria-disabled", "true");
  const label = el("span", {
    textContent: denied.denied || !host
      ? `Selection button: off here (${denied.reason || "not a web page"})`
      : settings.selectionButton === "all"
        ? `Selection button: on for all sites`
        : `Selection button on ${host}`,
  });
  sw.addEventListener("click", async () => {
    if (sw.getAttribute("aria-disabled") === "true" || settings.selectionButton === "all") return api.runtime.openOptionsPage();
    const next = { ...settings };
    if (sw.getAttribute("aria-checked") === "true") {
      next.sites = next.sites.filter((s) => s !== host);
      if (!next.sites.length) next.selectionButton = "off";
    } else {
      const granted = await api.permissions.request({ origins: L.originsFor({ selectionButton: "sites", sites: [host] }) }).catch(() => false);
      if (!granted) return;
      next.selectionButton = "sites";
      next.sites = [...new Set([...next.sites, host])];
    }
    await api.storage.local.set({ lensSettings: L.sanitizeSettings(next) });
    sw.setAttribute("aria-checked", sw.getAttribute("aria-checked") === "true" ? "false" : "true");
  });
  const site = el("div", { className: "l-site" }, label, sw);
  const links = el(
    "div",
    { className: "l-links" },
    ...(isYoutubeVideoUrl(tab?.url || "")
      ? [el("button", {
          textContent: "Get transcript",
          onclick: () => {
            api.runtime.sendMessage({ type: "transcript-load" }).catch(() => {});
            openPanel();
          },
        })]
      : []),
    el("button", { textContent: "Side panel", onclick: openPanel }),
    el("button", { textContent: "Settings", onclick: () => api.runtime.openOptionsPage() }),
  );
  dash.root.insertBefore(site, dash.root.querySelector(".l-foot"));
  dash.root.insertBefore(links, dash.root.querySelector(".l-foot"));
})();

async function openPanel() {
  if (api.sidebarAction) {
    api.sidebarAction.open();
    window.close();
    return;
  }
  const win = await api.windows.getCurrent();
  if (api.sidePanel) await api.sidePanel.open({ windowId: win.id }).catch(() => {});
  window.close();
}
