// Prepares the brand files the site serves from docs/brand/ (masters, favicon, PNGs, OG card) and
// derives the two layers of the animated hero logo from the master SVG:
//   brand/lens-logo-overlay.svg  everything that stays still: bezel, glass glare, vignette and stars
//                                (a few stars get class "tw" for a gentle twinkle)
//   brand/nebula.webp            the inner nebula, the texture the WebGL canvas warps (js/logo.js)
//   brand/lens-orb.webp          a 64 px disc of the nebula: the "Lens at work" orb on the stage (js/presence.js)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function buildBrand(root, site) {
  const src = join(root, "docs/brand");
  const out = join(site, "brand");
  mkdirSync(out, { recursive: true });
  for (const f of ["lens-logo.svg", "lens-logo-small.svg", "favicon.ico", "apple-touch-icon.png", "og.png", "lens-orb.webp"]) copyFileSync(join(src, f), join(out, f));
  for (const s of [32, 64, 128, 256]) copyFileSync(join(src, `png/lens-${s}.png`), join(out, `lens-${s}.png`));

  const master = readFileSync(join(src, "lens-logo.svg"), "utf8");
  let overlay = master
    .replace(/<rect width="512" height="512" fill="#050507"\/>/, "")
    .replace(/<g filter="url\(#f\)">[\s\S]*?<\/g>/, "")
    .replace(/<filter id="f"[\s\S]*?<\/filter>/, "");
  // Unique ids: the overlay is inlined into pages that may hold other SVGs.
  overlay = overlay.replace(/id="([\w-]+)"/g, 'id="lg-$1"').replace(/url\(#([\w-]+)\)/g, "url(#lg-$1)");
  // Twinkle: every ninth small star.
  let n = 0;
  overlay = overlay.replace(/<circle cx="(\d+)" cy="(\d+)" r="(1\.4|1|0\.7)" fill="#fff" opacity="([\d.]+)"\/>/g, (m, x, y, r, o) =>
    ++n % 9 === 0 ? `<circle class="tw" style="--o:${o};--d:${(2.6 + (n % 5) * 0.7).toFixed(1)}s" cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>` : m);
  overlay = overlay.replace("<svg ", '<svg class="logo-overlay" aria-hidden="true" focusable="false" ');
  writeFileSync(join(out, "lens-logo-overlay.svg"), overlay);

  const neb = join(out, "nebula.webp");
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", join(src, "nebula.png"), "-vf", "scale=384:384", "-c:v", "libwebp", "-quality", "88", neb]);
  } catch {
    copyFileSync(join(src, "nebula.png"), join(out, "nebula.png"));
  }
  return { overlay, nebula: existsSync(neb) ? "brand/nebula.webp" : "brand/nebula.png" };
}
