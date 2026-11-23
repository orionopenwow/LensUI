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

export async function buildDock(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "dock"));
  const d = dockRoot();
  await build({ ...common, entryPoints: { dock: join(here, "dock-entry.tsx") }, outdir: out, alias: { ...mocksFor(d.dir), "@lens-src": join(d.dir, "src") }, nodePaths: [join(root, "node_modules")] });
  writeFileSync(join(out, "source.txt"), `Built from ${d.from}\n`);
  writeFileSync(
    join(out, "index.html"),
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Lens Dock (live demo)</title><link rel="stylesheet" href="dock.css"><style>:root{color-scheme:normal!important}html,body{background:transparent!important;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="dock.js"></script></body></html>`
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

const kb = (dir) => Math.round(readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0) / 1024);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = await buildDock();
  const p = await buildPlayground();
  const g = await buildGuide();
  const t = await buildThemes();
  console.log(`[live] dock (${dockRoot().from}) ${kb(d)} KB · playground ${kb(p)} KB · themes ${kb(t)} KB · guide ${kb(g.out)} KB (${g.source})`);
}
