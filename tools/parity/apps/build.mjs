// Bundles tools/parity/apps/entry.tsx with the Lens Apps mocks into tools/parity/apps/out/.
import { build } from "esbuild";
import { readdirSync, rmSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
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
// Official media fetched by tools/apps/fetch_media.py (gitignored cache). When present, the gallery
// shows the real icons and screenshots; without it (e.g. CI) it shows the icon/tint fallbacks.
const media = join(here, "../../apps/.media-cache");
if (existsSync(media)) cpSync(media, join(out, "media"), { recursive: true });
console.log(`[parity:apps] media cache ${existsSync(media) ? "found" : "missing (fallbacks only)"}`);
const css = readdirSync(out).filter((f) => f.endsWith(".css"));
writeFileSync(
  join(out, "harness.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="data:,">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}<style>html,body,#root{height:100%;margin:0}body{background:var(--lens-pack-base,#0d0d10)}</style></head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);
console.log(`[parity:apps] built into ${out}`);
