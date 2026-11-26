// The feature inventory for the hyper suite (docs/TESTING.md › Hyper suite): every setting, tool,
// Settings page, Command intent, surface and catalogued feature Lens has, from the sources that
// already describe them, with the tier that tests each one. Nothing here is hand-maintained:
// adding a setting to the catalogue, a page to the registry or an intent to the engine adds it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function buildInventory(root) {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const items = [];
  const add = (it) => items.push({ status: "untested", ...it });

  // 1. Settings and tools from the control catalogue (what agents and Command can change).
  const cat = JSON.parse(read("src/control/catalogue.json"));
  for (const e of cat.entries) {
    add({ id: `setting:${e.store}:${e.path}`, kind: "setting", label: e.label, source: "control catalogue", path: e.path, store: e.store, schema: e.schema, risk: e.risk, tier: e.store === "config" ? "headless" : "windows" });
  }
  for (const t of cat.tools) add({ id: `tool:${t.name || t.id}`, kind: "tool", label: t.name || t.id, source: "control catalogue", tier: "windows" });

  // 2. Settings pages and their sections (src/settings/registry.ts).
  const reg = read("src/settings/registry.ts");
  const pageRe = /\{\s*id:\s*"([a-z0-9-]+)",\s*group:\s*"([a-z]+)",\s*label:\s*"([^"]+)"/g;
  for (let m; (m = pageRe.exec(reg)); ) add({ id: `page:${m[1]}`, kind: "settings-page", label: m[3], source: "settings registry", page: m[1], tier: "headless" });

  // 3. Every row the Guide indexes (each Settings control with its page).
  const guide = JSON.parse(read("src/guide/index.json"));
  for (const g of guide.entries || []) {
    if (g.kind !== "setting" || g.target?.surface !== "settings") continue;
    add({ id: `row:${g.target.tab}:${g.title}`, kind: "settings-row", label: g.title, source: "guide index", page: g.target.tab, tier: "headless" });
  }

  // 4. Command intents (src-tauri/src/ai/intent.rs): every action and one phrasing for it.
  const intent = read("src-tauri/src/ai/intent.rs");
  const actions = [...(intent.match(/pub const ACTIONS: &\[&str\] = &\[([\s\S]*?)\];/)?.[1] || "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const table = [...(intent.match(/const TABLE: &\[\(&str, &str, &str\)\] = &\[([\s\S]*?)\n    \];/)?.[1] || "").matchAll(/\("([^"]+)",\s*"([a-z_]+)",\s*"([^"]*)"\)/g)];
  for (const a of actions) {
    const ex = table.find((m) => m[2] === a);
    add({ id: `intent:${a}`, kind: "command-intent", label: a, source: "intent engine", phrase: ex?.[1] ?? null, tier: "windows" });
  }

  // 5. Surfaces (windows) from the Tauri config.
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  for (const w of conf.app?.windows || []) add({ id: `surface:${w.label}`, kind: "surface", label: w.title || w.label, source: "tauri.conf.json", surface: w.label, tier: "headless" });
  // …and the windows Rust builds on first use (`WebviewUrl::App("index.html?surface=…")`).
  const rustWin = /WebviewUrl::App\("index\.html\?surface=([a-z-]+)"/g;
  for (const f of ["commands/dashboard.rs", "commands/magic.rs"]) {
    let text = "";
    try { text = read(`src-tauri/src/${f}`); } catch { continue; }
    for (let m; (m = rustWin.exec(text)); ) add({ id: `surface:${m[1]}`, kind: "surface", label: m[1], source: `src-tauri/src/${f}`, surface: m[1], tier: "headless" });
  }

  // 6. The feature catalogue (docs/brain/FEATURES.md): table rows with a status.
  try {
    const feats = read("docs/brain/FEATURES.md");
    for (const line of feats.split("\n")) {
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      const st = cells.find((c) => /^(Shipped|In PR|In a PR|Planned|Idea|Dropped)\b/i.test(c));
      const name = (cells[0] || "").replace(/\*\*[A-Z]\*\*\s*/, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
      if (st && name && !/^(Foundation|Feature|Status|Area)$/i.test(name)) {
        add({ id: `feature:${name.slice(0, 90)}`, kind: "feature", label: name.slice(0, 140), source: "FEATURES.md", featureStatus: /^in/i.test(st) ? "In PR" : st.match(/^[A-Za-z]+/)[0], tier: "doc" });
      }
    }
  } catch {}

  // De-duplicate by id (a row can appear twice in the Guide index).
  const seen = new Map();
  for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()];
}
