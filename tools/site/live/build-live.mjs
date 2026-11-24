// Bundles the website's live widgets from the real Lens frontend source:
//   docs/site/live/dock/        the real DockSurface on a mocked backend (iframe)
//   docs/site/live/playground/  the real Playground scenes on a plain canvas (ES module)
//   docs/site/live/guide/       the Lens Guide BM25 search (ES module)
//   docs/site/live/themes/      .lenstheme export/import and the pack registry (ES module)
// Run directly (`node tools/site/live/build-live.mjs`) or via tools/site/build.mjs.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..", "..");
// The live dock is built from the newest dock code available: this checkout when it already has the
// Islands dock and the Expressive / Dot Matrix shape styles, otherwise a detached worktree of
// origin/feature/pack-rosewood (PR #32) under tools/site/.cache/dock-src. Nested inside the repo, so
// its imports find this repo's node_modules.
const DOCK_BRANCH = process.env.LENS_SITE_DOCK_BRANCH || "origin/feature/pack-rosewood";
let dockRootMemo = null;
export function dockRoot() {
  if (dockRootMemo) return dockRootMemo;
  if (existsSync(join(root, "src/dock/islands"))) return (dockRootMemo = { dir: root, from: "this checkout" });
  const wt = join(here, "../.cache/dock-src");
  try {
    const sha = execFileSync("git", ["-C", root, "rev-parse", DOCK_BRANCH], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!existsSync(join(wt, ".git"))) execFileSync("git", ["-C", root, "worktree", "add", "--detach", "-f", wt, sha], { stdio: "ignore" });
    else execFileSync("git", ["-C", wt, "checkout", "-q", "--detach", sha], { stdio: "ignore" });
    return (dockRootMemo = { dir: wt, from: `${DOCK_BRANCH} (${sha.slice(0, 7)})` });
  } catch {
    return (dockRootMemo = { dir: root, from: "this checkout (dock branch unavailable)" });
  }
}
const mocksFor = (dir) => ({
  "@tauri-apps/api/core": join(dir, "tools/parity/mock/core.ts"),
  "@tauri-apps/api/event": join(dir, "tools/parity/mock/event.ts"),
  "@tauri-apps/api/window": join(dir, "tools/parity/mock/window.ts"),
});
const mocks = mocksFor(root);
// Features still in open pull requests are vendored in tools/site/vendor/ (see its README). Their
// relative imports resolve as if the files sat in src/: vendored copies first, the real src second.
const VENDOR = [
  [join(here, "../vendor/ambient"), join(root, "src/playground/ambient")],
  [join(here, "../vendor/themes"), join(root, "src/themes")],
];
const exists = (p) => ["", ".ts", ".tsx", ".js", "/index.ts"].map((e) => p + e).find((f) => existsSync(f) && !statSync(f).isDirectory());
const vendorPlugin = {
  name: "lens-vendor",
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, (a) => {
      for (const [vdir, rdir] of VENDOR) {
        if (!a.importer.startsWith(vdir)) continue;
        const virtual = resolve(join(rdir, relative(vdir, dirname(a.importer))), a.path);
        const fromVendor = virtual.startsWith(rdir) ? exists(join(vdir, relative(rdir, virtual))) : null;
        const hit = fromVendor ?? exists(virtual);
        if (hit) return { path: hit };
      }
      return undefined;
    });
  },
};
/** The real module when this checkout has it, else the vendored snapshot. */
const pick = (real, vendored) => (existsSync(join(root, real)) ? join(root, real) : join(here, "../vendor", vendored));
export const VENDORED = {
  ambient: pick("src/playground/ambient/module.ts", "ambient/module.ts"),
  claudePacks: pick("src/themes/community/claude.ts", "themes/community/claude.ts"),
};

const common = {
  plugins: [vendorPlugin],
  bundle: true,
  format: "esm",
  minify: true,
  jsx: "automatic",
  target: ["es2020"],
  loader: { ".css": "css", ".png": "dataurl", ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
  legalComments: "none",
};

function fresh(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Site-only CSS: the demo frame is a few hundred pixels tall, so the in-dock search drawer shows one
// compact column (recent files and open windows, or the results) instead of the desktop's 520 px grid.
const SITE_DOCK_CSS = [
  ".dock-launcher-drawer .pal-two-col{min-height:0!important;grid-template-columns:minmax(0,1fr)!important}",
  ".dock-launcher-drawer .pal-two-col>div:nth-child(2){display:none!important}",
  ".dock-launcher-drawer .pal-recent-list{max-height:var(--site-list-h,176px)!important}",
  ".dock-launcher-drawer .pal-results{min-height:0!important;max-height:var(--site-list-h,176px)!important}",
  ".dock-launcher-drawer .pal-filter-bar{flex-wrap:nowrap;overflow:hidden}",
].join("");

export async function buildDock(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "dock"));
  const d = dockRoot();
  await build({ ...common, entryPoints: { dock: join(here, "dock-entry.tsx") }, outdir: out, alias: { ...mocksFor(d.dir), "@tauri-apps/api/core": join(here, "site-core.ts"), "@lens-src": join(d.dir, "src") }, nodePaths: [join(root, "node_modules")] });
  writeFileSync(join(out, "source.txt"), `Built from ${d.from}\n`);
  writeFileSync(
    join(out, "index.html"),
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Lens Dock (live demo)</title><link rel="stylesheet" href="dock.css"><style>:root{color-scheme:normal!important}html,body{background:transparent!important;overflow:hidden}${SITE_DOCK_CSS}</style></head><body><div id="root"></div><script type="module" src="dock.js"></script></body></html>`
  );
  return out;
}

export async function buildPlayground(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "playground"));
  await build({ ...common, entryPoints: { playground: join(here, "playground-entry.ts") }, outdir: out, alias: { ...mocks, "lens-ambient": VENDORED.ambient, "lens-ambient-palette": join(dirname(VENDORED.ambient), "packPalette.ts") } });
  return out;
}

export async function buildThemes(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "themes"));
  await build({ ...common, entryPoints: { themes: join(here, "themes-entry.ts") }, outdir: out, alias: mocks });
  return out;
}

/** The Guide search (src/guide/search.ts) when it exists in this checkout, else the vendored copy. */
export async function buildGuide(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "guide"));
  const real = join(root, "src/guide/search.ts");
  const entry = existsSync(real) ? real : join(here, "../vendor/guide/search.ts");
  await build({ ...common, entryPoints: { search: entry }, outdir: out });
  return { out, source: existsSync(real) ? "src/guide/search.ts" : "tools/site/vendor/guide/search.ts" };
}


// ---- the real app surfaces for the demo ---------------------------------------------------------------
// One build with code splitting: React, the tokens and the mock backend land in shared chunks, and
// each surface is its own entry that loads only when its demo window opens.
//   live/app/shell.html?surface=…   src/main.tsx (Settings, Quick Settings, top bar, Lens Apps, …)
//   live/app/<gallery>.html?scene=… the parity galleries, which render the real components with
//                                   scripted demo data (browser, command, cleaner, coreapps, music, approval)
//   live/app/magic.html?scene=…     the real magic right-click window on its own
const CHAIN = ["cleaner", "music", "command", "browser", "apps"];
const chainPlugin = {
  name: "lens-mock-chain",
  setup(b) {
    b.onResolve({ filter: /^\.\.\/mock\/core$/ }, (a) => {
      const i = CHAIN.findIndex((g) => a.importer === join(root, "tools/parity", g, "mockCore.ts"));
      if (i < 0) return undefined;
      const next = CHAIN[i + 1];
      return { path: next ? join(root, "tools/parity", next, "mockCore.ts") : join(root, "tools/parity/mock/core.ts") };
    });
  },
};
export const APP_SURFACES = ["shell", "browser", "command", "cleaner", "coreapps", "music", "approval", "magic"];
export async function buildApp(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "app"));
  const entryPoints = Object.fromEntries(APP_SURFACES.map((n) => [n, join(here, "surfaces", existsSync(join(here, "surfaces", `${n}.tsx`)) ? `${n}.tsx` : `${n}.ts`)]));
  const r = await build({
    ...common,
    plugins: [chainPlugin, vendorPlugin],
    entryPoints,
    outdir: out,
    splitting: true,
    metafile: true,
    chunkNames: "c/[name]-[hash]",
    loader: { ...common.loader, ".json": "json", ".woff2": "dataurl", ".html": "text" },
    define: { ...common.define, __LENS_MEDIA_CACHE__: "false" },
    alias: { "@tauri-apps/api/core": join(here, "app-core.ts"), "@tauri-apps/api/event": mocks["@tauri-apps/api/event"], "@tauri-apps/api/window": join(here, "app-window.ts") },
  });
  // CSS: an entry's own stylesheet, plus (for the shell, whose surfaces load lazily) every stylesheet
  // esbuild split out for a lazy chunk, since those aren't injected automatically.
  const outs = r.metafile.outputs, rel = (f) => relative(out, join(root, f)).replaceAll("\\", "/");
  const entryCss = new Set(), all = [];
  for (const [f, o] of Object.entries(outs)) { if (f.endsWith(".css")) all.push(rel(f)); if (o.entryPoint && o.cssBundle) entryCss.add(rel(o.cssBundle)); }
  const lazyCss = all.filter((c) => !entryCss.has(c)).sort();
  const sizes = {};
  for (const n of APP_SURFACES) {
    const css = [existsSync(join(out, `${n}.css`)) ? `${n}.css` : null, ...(n === "shell" ? lazyCss : [])].filter(Boolean);
    writeFileSync(join(out, `${n}.html`), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lens (live demo)</title>${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head><body><div id="root"></div><script type="module" src="${n}.js"></script></body></html>`);
    // What a first visit to this surface downloads: its entry and every chunk it imports statically.
    const seen = new Set();
    const walk = (f) => { if (seen.has(f) || !outs[f]) return; seen.add(f); for (const i of outs[f].imports) if (i.kind === "import-statement") walk(i.path); };
    walk(Object.keys(outs).find((f) => outs[f].entryPoint && f.endsWith(`/${n}.js`)));
    sizes[n] = [...seen];
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(Object.fromEntries(Object.entries(sizes).map(([n, fs]) => [n, fs.map(rel)])), null, 1));
  return out;
}

const kb = (dir) => Math.round(readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0) / 1024);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = await buildDock();
  const p = await buildPlayground();
  const g = await buildGuide();
  const t = await buildThemes();
  const a = await buildApp();
  console.log(`[live] dock (${dockRoot().from}) ${kb(d)} KB · playground ${kb(p)} KB · themes ${kb(t)} KB · guide ${kb(g.out)} KB (${g.source})`);
}
