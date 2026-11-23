// Bundles the AI surfaces gallery with the Tauri APIs mocked (AI, transcription and Shelf contracts included).
// Output: tools/parity/ai/out/index.html?scene=<name>&preset=<pack>
import { build } from "esbuild";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "gallery.tsx")],
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
writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="gallery.css"></head><body><div id="root"></div><script type="module" src="gallery.js"></script></body></html>`
);
console.log(`[parity-ai] built ${readdirSync(out).join(", ")}`);
