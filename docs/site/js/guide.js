// "Ask the Guide" on the website. The same BM25 search Lens uses (src/guide/search.ts, bundled to
// live/guide/search.js) over the Lens Guide index plus this site's pages. Runs entirely in the
// browser: no network calls beyond loading these files, no model, no keys.
import { flash } from "./site.js";

const SITE = new URL("../", import.meta.url);
const SUGGEST = ["How do I make the dock thinner?", "Change the theme", "Turn off AI", "Undo everything Lens changed", "Falling sand wallpaper", "Hot corners", "What does Lens send to Claude?", "Keyboard shortcuts"];
let search, entries, panel, input, body, lastFocus;

async function load() {
  if (search) return;
  const [{ GuideSearch }, idx] = await Promise.all([
    import(new URL("live/guide/search.js", SITE).href),
    fetch(new URL("data/guide-index.json", SITE)).then((r) => r.json()),
  ]);
  entries = idx.entries;
  search = new GuideSearch(idx);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function build() {
  panel = document.createElement("div");
  panel.className = "guide-panel";
  panel.id = "guide-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "guide-title");
  panel.innerHTML = `
    <header><strong id="guide-title">Ask the Guide</strong><span class="meta">offline · BM25</span>
      <button class="icon-btn" type="button" data-close aria-label="Close the Guide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <form role="search"><label class="sr" for="guide-q">Question</label><input id="guide-q" type="search" placeholder="How do I…" autocomplete="off"><button class="btn small" type="submit">Ask <kbd>⏎</kbd></button></form>
    <div class="body" aria-live="polite"></div>
    <div class="foot">This guide runs in your browser. In Lens it can also use your local model or Claude if you turn AI on.</div>`;
  document.body.append(panel);
  input = panel.querySelector("input");
  body = panel.querySelector(".body");
  panel.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); answer(input.value); });
  input.addEventListener("input", () => { clearTimeout(input._t); input._t = setTimeout(() => answer(input.value, true), 180); });
  panel.querySelector("[data-close]").addEventListener("click", close);
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  body.addEventListener("click", (e) => {
    const s = e.target.closest("[data-sugg]");
    if (s) { input.value = s.dataset.sugg; answer(s.dataset.sugg); return; }
    const show = e.target.closest("[data-show]");
    if (show) showMe(show.dataset.show, e);
  });
  home();
}

function home() {
  body.innerHTML = `<p class="meta">Try one:</p><div class="sugg">${SUGGEST.map((s) => `<button type="button" data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
}

function card(e) {
  const where = (e.path || []).join(" › ");
  const text = (e.text || "").replace(/\s+/g, " ");
  const short = text.length > 220 ? text.slice(0, text.lastIndexOf(" ", 220)) + "…" : text;
  const clip = e.clip ? `<img src="${new URL(`media/${e.clip}.webp`, SITE)}" alt="" loading="lazy" width="380">` : "";
  const examples = e.examples?.length ? `<p class="mono" style="font-size:12.5px">${e.examples.slice(0, 3).map((x) => `“${esc(x)}”`).join(" · ")}</p>` : "";
  return `<div class="ans"><h4>${esc(e.title)}</h4><div class="meta">${esc(where)}</div>${clip}${short && short !== e.title ? `<p>${esc(short)}</p>` : ""}${examples}
    <div class="row">${e.href ? `<a class="btn small" href="${new URL(e.href, SITE)}" data-show="${esc(e.href)}">Show me</a>` : ""}${e.doc ? `<a class="btn small" href="${new URL(e.doc, SITE)}">Read the doc</a>` : ""}</div></div>`;
}

async function answer(q, typing = false) {
  q = q.trim();
  if (!q) return home();
  if (!search) { body.innerHTML = `<p class="meta">Loading the index…</p>`; await load(); }
  const hits = search.search(q, { limit: 4 });
  const top = hits[0]?.score ?? 0;
  if (!hits.length || top < 1.2) {
    if (typing) return;
    body.innerHTML = `<p>I couldn't find that in Lens's settings or docs. Try other words, or browse the <a href="${new URL("docs/", SITE)}">user guide</a>.</p><div class="sugg">${SUGGEST.slice(0, 4).map((s) => `<button type="button" data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
    return;
  }
  const good = hits.filter((h) => h.score >= top * 0.45).slice(0, 3);
  body.innerHTML = `<p class="meta">${good.length === 1 ? "Best match" : `Top ${good.length} matches`} from Lens's own index</p>${good.map((h) => card(h.entry)).join("")}`;
}

function showMe(href, e) {
  const u = new URL(href, SITE);
  if (u.pathname === location.pathname && u.hash) {
    e.preventDefault();
    flash(decodeURIComponent(u.hash.slice(1)));
    history.replaceState(null, "", u.hash);
    if (matchMedia("(max-width: 560px)").matches) close();
  }
}

export async function open(q) {
  if (!panel) build();
  lastFocus = document.activeElement;
  panel.classList.add("open");
  document.getElementById("guide-fab")?.setAttribute("aria-expanded", "true");
  input.focus();
  load().catch(() => { body.innerHTML = `<p>The Guide index didn't load. The <a href="${new URL("docs/", SITE)}">user guide</a> has the same answers.</p>`; });
  if (q) { input.value = q; answer(q); }
}
function close() {
  panel.classList.remove("open");
  document.getElementById("guide-fab")?.setAttribute("aria-expanded", "false");
  lastFocus?.focus?.();
}
