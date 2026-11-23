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
  const { dockRoot, VENDORED } = await import("../live/build-live.mjs");
  // The packs of the dock source the live dock is built from (it may have newer packs).
  await build({ entryPoints: [join(dockRoot().dir, "src/themes/packs.ts")], bundle: true, format: "esm", platform: "neutral", outfile: file, logLevel: "error" });
  const m = await import(pathToFileURL(file).href + "?t=" + Date.now());
  const toSite = (p, collection) => ({
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
    shapeStyle: p.shapeStyle,
    ...(collection ? { collection, source: p.source ? { name: p.source.name, author: p.source.author, url: p.source.url } : undefined } : {}),
  });
  // The living themes (Sky and family) come through allPacks(); they aren't exported on their own.
  let living = [];
  try { living = (m.allPacks?.() ?? []).filter((p) => p.tier === "Living"); } catch { /* older dock source */ }
  const core = [...m.THEME_PACKS, ...living].map((p) => toSite(p));
  // The Claude Code community collection (feature/claude-theme-packs), when available.
  const cfile = join(tmp, "claude.mjs");
  await build({ entryPoints: [VENDORED.claudePacks], bundle: true, format: "esm", platform: "neutral", outfile: cfile, logLevel: "error" });
  const c = await import(pathToFileURL(cfile).href + "?t=" + Date.now());
  const ids = new Set(core.map((p) => p.id));
  const community = (c.CLAUDE_PACKS ?? []).filter((p) => !ids.has(p.id)).map((p) => toSite(p, c.CLAUDE_COLLECTION ?? "Claude Code"));
  return [...core, ...community];
}

export async function writePacks(outFile) {
  const packs = await loadPacks();
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(packs) + "\n");
  return packs;
}
