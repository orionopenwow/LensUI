// Bundles tools/parity/rightclick/entry.tsx (right-click card, packs, toast) into ./out.
import { build } from "esbuild";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  loader: { ".css": "css", ".json": "json" },
  alias: {
    "@tauri-apps/api/core": join(here, "mockCore.ts"),
    "@tauri-apps/api/event": join(here, "../mock/event.ts"),
    "@tauri-apps/api/window": join(here, "../mock/window.ts"),
    "@tauri-apps/api/webview": join(here, "webviewMock.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const css = readdirSync(out).filter((f) => f.endsWith(".css"));
writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
console.log(`[parity:rightclick] built into ${out}`);
