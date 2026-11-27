// Builds the robustness harness: the real frontend (src/main.tsx) with Tauri mocked, like
// tools/parity/build.mjs, but with the chaos-capable core mock and the dpi/webview modules stubbed.
// Output: tools/robust/out/harness.html?surface=<name>&preset=<pack>[&chaos=0.05&seed=1]
import { build } from "esbuild";
import { readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = join(here, "out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "src/main.tsx")],
  bundle: true,
  outdir: out,
  format: "esm",
  splitting: true,
  jsx: "automatic",
  loader: { ".css": "css" },
  alias: {
    "@tauri-apps/api/core": join(here, "mock/core.ts"),
    "@tauri-apps/api/event": join(root, "tools/parity/mock/event.ts"),
    "@tauri-apps/api/window": join(root, "tools/parity/mock/window.ts"),
  },
  // The harness renders Lens Mission Control too (dev-only surface, docs/MISSION_CONTROL.md):
  // tools/visual/run.mjs and tools/parity/mission/shoot.mjs open it with ?mcmock=1. Never a release.
  define: { "process.env.NODE_ENV": '"production"', __LENS_ADMIN__: "true" },
  logLevel: "warning",
});

const css = readdirSync(out)
  .filter((f) => f.endsWith(".css"))
  .sort((a, b) => (a === "main.css" ? -1 : b === "main.css" ? 1 : a.localeCompare(b)));
writeFileSync(
  join(out, "harness.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>`
);
console.log(`[robust] built ${readdirSync(out).length} files into ${out}`);
