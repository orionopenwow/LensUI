// Bundles tools/parity/ambient/entry.ts into tools/parity/ambient/out/ (no Tauri APIs needed).
import { build } from "esbuild";
import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({ entryPoints: [join(here, "entry.ts")], bundle: true, outdir: out, format: "esm", logLevel: "warning" });
writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0}</style></head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
console.log(`[parity:ambient] built into ${out}`);
