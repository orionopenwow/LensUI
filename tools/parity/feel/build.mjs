// Bundles the feel scene (feel.tsx) into tools/robust/out/feel/, next to the robustness harness, so
// tools/visual/run.mjs and tools/perf/run.mjs serve it from the same place. Run after
// tools/robust/build.mjs (which clears its out/ folder).
import { build } from "esbuild";
import { readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const out = join(root, "tools/robust/out/feel");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "feel.tsx")],
  bundle: true,
  outdir: out,
  format: "esm",
  jsx: "automatic",
  loader: { ".css": "css" },
  alias: {
    "@tauri-apps/api/core": join(root, "tools/robust/mock/core.ts"),
    "@tauri-apps/api/event": join(root, "tools/parity/mock/event.ts"),
    "@tauri-apps/api/window": join(root, "tools/parity/mock/window.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const css = readdirSync(out).filter((f) => f.endsWith(".css"));
writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="data:,">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head><body><div id="root"></div><script type="module" src="feel.js"></script></body></html>`
);
console.log(`[parity:feel] built into ${out}`);
