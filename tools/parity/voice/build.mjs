// Builds the voice gallery: tools/parity/voice/out/index.html?scene=…&preset=…
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
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
const css = readdirSync(out).filter((f) => f.endsWith(".css"));
writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
console.log("[voice gallery] built", out);
