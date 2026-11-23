// Fetches the real icons and screenshots for the website's "Free and open-source apps" section from
// the pinned commits the Lens Apps catalogue records (catalog/apps/catalog.json `media`, on
// feature/lens-apps until merged; vendored snapshot in tools/site/vendor/apps/media.json).
//
// It uses git (a shallow, tree-less fetch of the pinned commit, then the one blob), so it works
// wherever github.com is reachable. Images are resized to WebP into docs/site/media/apps/ (built,
// not committed: they stay under each project's own licence, credited on the page).
// Usage: node tools/site/fetch-app-media.mjs        (skips files already fetched)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const cache = join(here, ".cache/app-media");
const out = join(root, "docs/site/media/apps");
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });
const media = JSON.parse(readFileSync(join(here, "vendor/apps/media.json"), "utf8"));

const RAW = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([0-9a-f]{40})\/(.+)$/;
function fetchBlob(url, dest) {
  const m = url.match(RAW);
  if (!m) throw new Error(`not a pinned raw URL: ${url}`);
  const [, owner, repo, sha, path] = m;
  const git = join(cache, `${owner}__${repo}.git`);
  if (!existsSync(git)) execFileSync("git", ["init", "-q", "--bare", git]);
  const run = (...a) => execFileSync("git", ["-C", git, ...a], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 });
  try { run("cat-file", "-e", `${sha}^{commit}`); } catch { run("fetch", "-q", "--depth=1", "--filter=tree:0", `https://github.com/${owner}/${repo}`, sha); }
  writeFileSync(dest, run("cat-file", "-p", `${sha}:${decodeURIComponent(path)}`));
}

/** Resize to WebP with Pillow (handles PNG, animated WebP's first frame, and SVG via a fallback). */
function toWebp(src, dest, width) {
  execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image
im = Image.open(sys.argv[1]); im.seek(0); im = im.convert("RGBA")
w = int(sys.argv[3]); h = round(im.height * w / im.width)
im.resize((w, h), Image.LANCZOS).save(sys.argv[2], "WEBP", quality=82, method=5)
`, src, dest, String(width)]);
}

const result = {};
for (const [id, m] of Object.entries(media)) {
  result[id] = { ...m, files: {} };
  const jobs = [["icon", m.icon, 128], ...(m.shots ?? []).map((u, i) => [`shot${i}`, u, i === 0 ? 1100 : 640])];
  for (const [key, url, width] of jobs) {
    if (!url) continue;
    const name = `${id}-${key}.webp`;
    const dest = join(out, name);
    try {
      if (!existsSync(dest)) {
        const raw = join(cache, `${id}-${key}.src${url.endsWith(".svg") ? ".svg" : ""}`);
        fetchBlob(url, raw);
        if (url.endsWith(".svg")) { writeFileSync(join(out, `${id}-${key}.svg`), readFileSync(raw)); result[id].files[key] = `${id}-${key}.svg`; continue; }
        toWebp(raw, dest, width);
      }
      result[id].files[key] = name;
    } catch (e) {
      if (url.endsWith(".svg") && existsSync(join(out, `${id}-${key}.svg`))) { result[id].files[key] = `${id}-${key}.svg`; continue; }
      console.warn(`[app-media] ${id} ${key}: ${String(e.message).split("\n")[0]}`);
    }
  }
}
writeFileSync(join(root, "docs/site/data/app-media.json"), JSON.stringify(result, null, 1));
const n = Object.values(result).reduce((k, r) => k + Object.keys(r.files).length, 0);
console.log(`[app-media] ${n} images for ${Object.keys(result).length} apps in docs/site/media/apps/`);
