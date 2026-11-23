// Controls for the live dock (an iframe running the real Lens DockSurface on a mocked backend).
// Every control sends a config patch to the iframe; the dock re-renders exactly as Lens would.
const SITE = new URL("../", import.meta.url);

export async function initDockDemo(stage) {
  const frame = stage.querySelector("iframe");
  const status = stage.querySelector("[data-dock-status]");
  const send = (patch) => frame.contentWindow?.postMessage({ lens: "config", patch }, location.origin);
  let ready = false;
  const queue = [];
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.data?.lens !== "ready") return;
    ready = true;
    stage.classList.add("is-live");
    stage.querySelector(".fallback")?.setAttribute("hidden", "");
    if (status) status.textContent = "live · real dock component";
    queue.splice(0).forEach(send);
  });
  // Ask again once the frame has loaded, in case its hello arrived before this listener.
  frame.addEventListener("load", () => frame.contentWindow?.postMessage({ lens: "ping" }, location.origin));
  frame.contentWindow?.postMessage({ lens: "ping" }, location.origin);
  const packs = await fetch(new URL("data/packs.json", SITE)).then((r) => r.json()).catch(() => []);
  const patch = (p) => (ready ? send(p) : queue.push(p));
  const tint = (pack) => {
    const screen = stage.querySelector(".screen");
    if (screen) screen.style.background = pack.base ? `linear-gradient(180deg, ${pack.base}, color-mix(in srgb, ${pack.base} 70%, #000))` : "";
  };

  // segmented controls: data-seg="dock.style" with buttons data-v="slim"
  stage.querySelectorAll("[data-seg]").forEach((seg) => {
    const path = seg.dataset.seg.split(".");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const p = {};
      let o = p;
      path.slice(0, -1).forEach((k) => (o = o[k] = {}));
      o[path.at(-1)] = b.dataset.v;
      patch(p);
    });
  });

  const sel = stage.querySelector("select[data-pack]");
  let picked = false;
  if (sel && packs.length) {
    sel.innerHTML = packs.map((p) => `<option value="${p.id}">${p.label}${p.scheme === "light" ? " (light)" : ""}</option>`).join("");
    const follow = async () => {
      // Until the visitor picks a pack, match the site: Obsidian in dark, Alabaster Daylight in light.
      if (picked) return;
      const { isLight } = await import("./site.js");
      sel.value = isLight() ? "alabaster-daylight" : "obsidian";
      apply(false);
    };
    const apply = (byUser = true) => {
      if (byUser) picked = true;
      const pack = packs.find((p) => p.id === sel.value);
      patch({ theme: { preset: pack.id, customAccent: pack.accent, accentMode: "custom", borderRadius: pack.radius } });
      tint(pack);
    };
    sel.addEventListener("change", () => apply());
    addEventListener("site-theme", follow);
    follow();
  }
  stage.querySelector("[data-dock-search]")?.addEventListener("click", () => {
    frame.contentWindow?.postMessage({ lens: "search" }, location.origin);
    frame.focus();
  });
  // Narrow screens: render the dock at desktop width and scale it down, like a screenshot.
  const fit = () => {
    const cw = stage.querySelector(".screen").clientWidth;
    const s = Math.min(1, cw / 900);
    Object.assign(frame.style, s < 1 ? { width: "900px", transform: `scale(${s})`, transformOrigin: "left bottom" } : { width: "", transform: "", transformOrigin: "" });
  };
  addEventListener("resize", fit);
  fit();
  // If the iframe never says hello (blocked, very old browser), the poster image stays.
  setTimeout(() => { if (!ready && status) status.textContent = "preview image · live dock didn't load"; }, 8000);
}
