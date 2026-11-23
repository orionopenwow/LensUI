// Bundles tools/parity/guide/entry.tsx with the Guide mocks into tools/parity/guide/out/.
import { build } from "esbuild";
import { readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, "entry.tsx")],
  bundle: true,
  outdir: out,
  format: "esm",
  splitting: true,
  jsx: "automatic",
  loader: { ".css": "css" },
  alias: {
    "@tauri-apps/api/core": join(here, "mockCore.ts"),
    "@tauri-apps/api/event": join(here, "../mock/event.ts"),
    "@tauri-apps/api/window": join(here, "../mock/window.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const css = readdirSync(out).filter((f) => f.endsWith(".css")).sort((a, b) => (a === "entry.css" ? -1 : b === "entry.css" ? 1 : a.localeCompare(b)));
writeFileSync(
  join(out, "harness.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}<style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
console.log(`[parity:guide] built into ${out}`);
