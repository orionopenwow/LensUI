// Reads the real Dock style list (src/dock/styles.ts, DOCK_STYLES) and draws each style with the app's
// own picker drawing (src/dock/DockStylePreview.tsx), so the website's style cards and the app's
// Settings agree: a new style in DOCK_STYLES gets a card, a drawing and a live dock on the site with
// no site change. Bundled for Node with esbuild, rendered to static SVG with react-dom/server.
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Site-only looks built on a real style: a shape style plus the pack made for it (as Lens's packs do). */
export const DOCK_VARIANTS = [
  { id: "expressive", base: "islands", label: "Expressive", description: "Islands with soft, bold shapes and its own pack.", shape: "expressive", pack: "lens-expressive" },
  { id: "dotmatrix", base: "islands", label: "Dot Matrix", description: "Islands drawn in dots, with its own pack.", shape: "dotmatrix", pack: "lens-dot-matrix" },
];

/** The picture's SVG without its own size, role and label: the site's card names it. */
const clean = (svg) => svg.replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(width|height|role|aria-label)="[^"]*"/g, "").replace(/class="dock-style-preview[^"]*"/, 'class="dsp" aria-hidden="true" focusable="false"'));

/**
 * The site's card shows the lower part of the app's 112×64 drawing (the dock and the desk just above
 * it, full width so full-width styles still bleed edge to edge), with a faint window behind the dock,
 * so the dock's shape reads at card size. The geometry is the app's, untouched.
 */
const card = (svg) => svg.replace('viewBox="0 0 112 64"', 'viewBox="0 26 112 38"').replace(/(<rect class="dsp-topbar"[^>]*><\/rect>)/, '$1<rect class="dsp-win" x="24" y="31" width="64" height="17" rx="2"></rect><rect class="dsp-winbar" x="24" y="31" width="64" height="3.5" rx="2"></rect>');

/** Expressive: the same islands, fully round, with round icons. Dot Matrix: the same islands, filled with dots. */
function variantSvg(svg, id) {
  if (id === "expressive") {
    return svg
      .replace('class="dsp"', 'class="dsp dsp-expressive"')
      .replace(/(<rect class="dsp-icon"[^>]*?)rx="[\d.]+"/g, (m, a) => `${a}rx="2.5"`);
  }
  if (id === "dotmatrix") {
    const pat = `<defs><pattern id="dsp-dots" width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".62" class="dsp-dot"/></pattern></defs>`;
    // Each icon becomes a 2×2 of dots in the icon's own square.
    const dots = (x, y, s) => [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]].map(([a, b]) => `<circle class="dsp-icon" cx="${+(x + a * s).toFixed(2)}" cy="${+(y + b * s).toFixed(2)}" r="${+(s * 0.2).toFixed(2)}"></circle>`).join("");
    return svg
      .replace('class="dsp"', 'class="dsp dsp-dotmatrix"')
      .replace(/(<svg[^>]*>)/, `$1${pat}`)
      .replace(/<rect class="dsp-icon" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*><\/rect>/g, (m, x, y, s) => dots(+x, +y, +s));
  }
  return svg;
}

/** [{ id, style, label, description, recommendedIconSize, fullWidth, svg, shape?, pack? }] in the app's order, then the site's variants. */
export async function loadDockStyles() {
  const { dockRoot } = await import("../live/build-live.mjs");
  const src = dockRoot().dir;
  const tmp = join(root, "tools/site/.cache");
  mkdirSync(tmp, { recursive: true });
  const entry = join(tmp, "dock-styles-entry.tsx");
  writeFileSync(entry, `import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DOCK_STYLES } from ${JSON.stringify(join(src, "src/dock/styles"))};
import { DockStylePreview } from ${JSON.stringify(join(src, "src/dock/DockStylePreview"))};
export const styles = DOCK_STYLES.map((s) => ({ ...s, svg: renderToStaticMarkup(createElement(DockStylePreview, { style: s.id })) }));
`);
  const out = join(tmp, "dock-styles.mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error", jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react-dom", "react/*", "react-dom/*"] });
  const m = await import(pathToFileURL(out).href + "?t=" + Date.now());
  const real = m.styles.map((s) => ({ id: s.id, style: s.id, label: s.label, description: s.description, recommendedIconSize: s.recommendedIconSize, fullWidth: s.fullWidth, svg: card(clean(s.svg)) }));
  const variants = DOCK_VARIANTS.filter((v) => real.some((s) => s.id === v.base)).map((v) => {
    const b = real.find((s) => s.id === v.base);
    return { ...b, id: v.id, style: v.base, label: v.label, description: v.description, shape: v.shape, pack: v.pack, svg: variantSvg(b.svg, v.id) };
  });
  return [...real, ...variants];
}
