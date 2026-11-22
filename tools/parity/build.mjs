// Bundles the real frontend (src/main.tsx) with Tauri APIs replaced by mocks, so every surface can be
// rendered in a normal browser. Output: tools/parity/out/harness.html?surface=<name>&preset=<pack>.
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
    "@tauri-apps/api/event": join(here, "mock/event.ts"),
    "@tauri-apps/api/window": join(here, "mock/window.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

// Lazy surfaces' CSS isn't auto-injected by esbuild's splitting, so link every stylesheet.
const css = readdirSync(out).filter((f) => f.endsWith(".css")).sort((a, b) => (a === "main.css" ? -1 : b === "main.css" ? 1 : a.localeCompare(b)));
writeFileSync(
  join(out, "harness.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>`
);
console.log(`[parity] built ${readdirSync(out).length} files into ${out}`);
