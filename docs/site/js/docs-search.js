// Docs search: the Lens Guide's BM25 search over every docs section, in the browser.
const SITE = new URL("../", import.meta.url);
const form = document.getElementById("docs-search");
const out = document.getElementById("docs-results");
let s;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
async function run(q) {
  if (!q.trim()) { out.innerHTML = ""; return; }
  if (!s) {
    const [{ GuideSearch }, idx] = await Promise.all([import(new URL("live/guide/search.js", SITE).href), fetch(new URL("data/docs-index.json", SITE)).then((r) => r.json())]);
    s = new GuideSearch(idx);
  }
  const hits = s.search(q, { limit: 8 });
  out.innerHTML = hits.length
    ? hits.map((h) => `<li><a href="${new URL(h.entry.href, SITE)}">${esc(h.entry.title)}<span>${esc(h.entry.path.join(" › "))} — ${esc(h.entry.text.slice(0, 140))}…</span></a></li>`).join("")
    : `<li class="meta">No matches. Try other words, or press <kbd>/</kbd> to ask the Guide.</li>`;
}
const input = form.querySelector("input");
form.addEventListener("submit", (e) => { e.preventDefault(); run(input.value); });
input.addEventListener("input", () => { clearTimeout(input._t); input._t = setTimeout(() => run(input.value), 200); });
const q = new URLSearchParams(location.search).get("q");
if (q) { input.value = q; run(q); }
