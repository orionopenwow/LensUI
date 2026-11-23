// Bundles tools/parity/browser/entry.tsx with mocked Tauri APIs into tools/parity/browser/out/.
import { build } from "esbuild";
import { readdirSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
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
  loader: { ".css": "css", ".json": "text" },
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
  join(out, "harness.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}<style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
// The page-agent smoke test loads the real injected script into a plain page.
copyFileSync(join(here, "../../../src-tauri/src/browser/page_agent.js"), join(out, "page_agent.js"));
copyFileSync(join(here, "agent-page.html"), join(out, "agent-page.html"));
console.log(`[parity:browser] built into ${out}`);
