// Bundles the website's live widgets from the real Lens frontend source:
//   docs/site/live/dock/        the real DockSurface on a mocked backend (iframe)
//   docs/site/live/playground/  the real Playground scenes on a plain canvas (ES module)
//   docs/site/live/guide/       the Lens Guide BM25 search (ES module)
//   docs/site/live/themes/      .lenstheme export/import and the pack registry (ES module)
// Run directly (`node tools/site/live/build-live.mjs`) or via tools/site/build.mjs.
import { build } from "esbuild";
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..", "..");
const mocks = {
  "@tauri-apps/api/core": join(root, "tools/parity/mock/core.ts"),
  "@tauri-apps/api/event": join(root, "tools/parity/mock/event.ts"),
  "@tauri-apps/api/window": join(root, "tools/parity/mock/window.ts"),
};
const common = {
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
  await build({ ...common, entryPoints: { dock: join(here, "dock-entry.tsx") }, outdir: out, alias: mocks });
  writeFileSync(
    join(out, "index.html"),
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Lens Dock (live demo)</title><link rel="stylesheet" href="dock.css"><style>:root{color-scheme:normal!important}html,body{background:transparent!important;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="dock.js"></script></body></html>`
  );
  return out;
}

export async function buildPlayground(outRoot = join(root, "docs/site/live")) {
  const out = fresh(join(outRoot, "playground"));
  await build({ ...common, entryPoints: { playground: join(here, "playground-entry.ts") }, outdir: out, alias: mocks });
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = await buildDock();
  const p = await buildPlayground();
  const g = await buildGuide();
  const t = await buildThemes();
  console.log(`[live] dock ${kb(d)} KB · playground ${kb(p)} KB · themes ${kb(t)} KB · guide ${kb(g.out)} KB (${g.source})`);
}
