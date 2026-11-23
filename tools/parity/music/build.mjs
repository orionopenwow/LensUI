// Bundles tools/parity/music/entry.tsx with the Lens Music mocks into tools/parity/music/out/.
import { build } from "esbuild";
import { cpSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
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
cpSync(join(here, "fixtures"), join(out, "fixtures"), { recursive: true });
const css = readdirSync(out).filter((f) => f.endsWith(".css"));
writeFileSync(
  join(out, "harness.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="data:,">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}<style>html,body,#root{height:100%;margin:0}body{background:var(--lens-pack-base,#0d0d10);position:relative}</style></head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
console.log(`[parity:music] built into ${out}`);
