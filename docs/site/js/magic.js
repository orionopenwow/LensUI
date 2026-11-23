// The magic right-click on the demo desk: one context-aware Lens menu for whatever is under the
// pointer (a video, a file, selected text, a link, a window), with working demo actions whose
// results land in the Shelf or in Notes. Mirrors the product's right-click window (src/magic).
import { iconUrl } from "./desk.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** What's under the pointer: { kind, label, el }. */
export function contextOf(target) {
  const sel = String(getSelection?.() ?? "").trim();
  const m = target.closest?.("[data-magic]");
  if (sel && target.closest?.(".lw")) return { kind: "text", label: sel.length > 40 ? `${sel.slice(0, 40)}…` : sel, text: sel };
  if (m?.dataset.magic === "video") return { kind: "video", label: "Lens in 90 seconds · video", el: m };
  if (m?.dataset.magic === "file") return { kind: "file", label: m.dataset.name, el: m };
  if (m?.dataset.magic === "link") return { kind: "link", label: m.textContent.trim(), el: m };
  if (m?.dataset.magic === "text") return { kind: "text", label: m.textContent.trim().slice(0, 40) + "…", text: m.textContent.trim(), el: m };
  const w = target.closest?.(".lw");
  if (w) return { kind: "window", label: w.querySelector(".lw-t").textContent, el: w };
  return null;
}

const ACTIONS = {
  video: [["Summarise video", "summary"], ["Get transcript", "transcript"], ["Save to Shelf", "shelf"], ["Ask Lens about it", "ask"], ["Snip this frame", "snip"]],
  file: [["Open with…", "openwith"], ["Summarise", "summary"], ["Copy to context", "context"], ["Save to Shelf", "shelf"], ["Pin to dock", "pin"]],
  text: [["Summarise", "summary"], ["Translate", "translate"], ["Copy to context", "context"], ["Save to Shelf", "shelf"], ["Ask Lens", "ask"]],
  link: [["Open in Lens Browser", "openlink"], ["Save to Shelf", "shelf"], ["Copy to context", "context"], ["Ask Lens", "ask"]],
  window: [["Snip window", "snip"], ["Ask Lens about this window", "ask"], ["Copy to context", "context"], ["Save to Shelf", "shelf"]],
};

export function magicMenu(desk, ctx, p) {
  const cv = desk.canvas;
  let m = cv.querySelector(".lx-magic");
  if (!m) { m = document.createElement("div"); m.className = "lx-magic"; m.setAttribute("role", "menu"); cv.append(m); }
  m.innerHTML = `<div class="mh"><img src="${iconUrl("lens-command")}" alt="" width="16" height="16"><span><b>Lens</b> · ${esc(ctx.label)}</span></div>${ACTIONS[ctx.kind].map(([l, a]) => `<button type="button" role="menuitem" data-a="${a}">${esc(l)}</button>`).join("")}`;
  m.hidden = false;
  const mw = 250, mh = m.offsetHeight || 230;
  m.style.transform = `translate3d(${Math.min(p.x, desk.W - mw - 8)}px, ${Math.min(p.y, desk.H - mh - 8)}px, 0)`;
  m.querySelector("button").focus({ preventScroll: true });
  const close = () => { m.hidden = true; };
  m.onclick = (e) => { const b = e.target.closest("[data-a]"); if (!b) return; close(); act(desk, b.dataset.a, ctx); };
  m.onkeydown = (e) => {
    const bs = [...m.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    if (e.key === "Escape") { e.stopPropagation(); close(); desk.root.focus({ preventScroll: true }); }
  };
  const off = (e) => { if (!m.contains(e.target)) { close(); removeEventListener("pointerdown", off, true); } };
  addEventListener("pointerdown", off, true);
  return m;
}

/** The Shelf: a slim panel on the right of the desk that collects what you send to it. */
export function shelf(desk) {
  let s = desk.canvas.querySelector(".lx-shelf");
  if (!s) {
    s = document.createElement("aside");
    s.className = "lx-shelf";
    s.setAttribute("aria-label", "Shelf");
    s.innerHTML = `<div class="sh"><b>Shelf</b><span class="n">0 items</span><button type="button" data-x aria-label="Close the Shelf">×</button></div><div class="items"></div><button type="button" class="pack">Send as a context pack</button>`;
    desk.canvas.append(s);
    s.querySelector("[data-x]").addEventListener("click", () => s.classList.remove("open"));
    s.querySelector(".pack").addEventListener("click", () => { const n = s.querySelectorAll(".it").length; desk.toast({ icon: "lens-command", app: "Lens", title: `Context pack ready · ${n} items`, body: "In Lens it goes to Claude after your OK." }); });
  }
  return {
    el: s,
    add(icon, title, body) {
      s.classList.add("open");
      const it = document.createElement("div");
      it.className = "it";
      it.innerHTML = `<img src="${iconUrl(icon)}" alt="" width="20" height="20"><div><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ""}</div>`;
      s.querySelector(".items").prepend(it);
      s.querySelector(".n").textContent = `${s.querySelectorAll(".it").length} items`;
      return it;
    },
  };
}

export async function act(desk, a, ctx) {
  const sh = () => shelf(desk);
  const ic = ctx.kind === "video" ? "lens-browser" : ctx.kind === "file" ? "file-doc" : ctx.kind === "link" ? "lens-browser" : "lens-notes";
  if (a === "summary") sh().add("lens-command", `Summary · ${ctx.label}`, ctx.kind === "video" ? "A 90-second tour: nine docks, 89 themes, Command and a helper that asks first." : ctx.kind === "file" ? "A launch checklist: two done, two to go; demo Friday 10:00." : "Lens 0.9 adds nine docks, 89 themes and an assistant that asks before it acts.");
  else if (a === "transcript") {
    sh().add("lens-browser", "Transcript · Lens in 90 seconds", "00:00 This is Lens… 00:12 nine dock styles… 00:41 Command…");
    const w = desk.open("notes");
    setTimeout(() => { const ed = w?.el.querySelector(".a-notes"); if (ed) ed.textContent = `Transcript — Lens in 90 seconds\n\n00:00 This is Lens, the everything desktop.\n00:12 Nine dock styles, one physics.\n00:41 Ctrl+Space: Lens Command.\n01:10 Every change undoes.`; }, 350);
  }
  else if (a === "shelf") sh().add(ic, ctx.label, ctx.kind === "link" ? "Link" : ctx.kind === "file" ? "File" : "Saved");
  else if (a === "context") { sh().add(ic, `Context · ${ctx.label}`, "Added to the next context pack"); }
  else if (a === "translate") sh().add("lens-command", "Translation · Spanish", "Nueve estilos de dock, 80 temas y un asistente que pregunta antes de actuar.");
  else if (a === "ask") desk.openCmd(`about ${ctx.label}`);
  else if (a === "snip") desk.toast({ icon: "lens-command", app: "Snip", title: "Captured", body: "Mark it up, blur what's private, send to Claude or a friend." });
  else if (a === "openwith") desk.open(ctx.el?.dataset.app || "notes");
  else if (a === "pin") desk.toast({ icon: "lens-apps", app: "Dock", title: `Pinned ${ctx.label}`, body: "It's in your dock now." });
  else if (a === "openlink") desk.open("browser");
}
