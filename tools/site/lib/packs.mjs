// Reads the real theme-pack registry (src/themes/packs.ts) by bundling it for Node, so the site's
// theme switcher and theme lab use exactly the values Lens ships.
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function loadPacks() {
  const tmp = join(root, "tools/site/.cache");
  mkdirSync(tmp, { recursive: true });
  const file = join(tmp, "packs.mjs");
  await build({ entryPoints: [join(root, "src/themes/packs.ts")], bundle: true, format: "esm", platform: "neutral", outfile: file, logLevel: "error" });
  const m = await import(pathToFileURL(file).href + "?t=" + Date.now());
  return m.THEME_PACKS.map((p) => ({
    id: p.id,
    label: p.label,
    tier: p.tier,
    scheme: p.scheme === "light" ? "light" : "dark",
    base: p.base ?? null,
    elevated: p.base ? (p.scheme === "light" ? "#FFFFFF" : m.lighten(p.base, 0.045)) : null,
    accent: p.accent,
    accentMode: p.accentMode,
    radius: p.radius,
    dockStyle: p.dockStyle ?? "floating",
    recommended: !!p.recommended,
    description: p.description ?? "",
    frameStyle: p.frameStyle,
    controlStyle: p.controlStyle,
  }));
}

export async function writePacks(outFile) {
  const packs = await loadPacks();
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(packs) + "\n");
  return packs;
}
