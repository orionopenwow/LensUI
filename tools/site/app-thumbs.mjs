// Makes the Lens Apps thumbnails the website shows (docs/media/apps/<id>.webp, committed): one real
// screenshot per app, taken from the project's own repository at the pinned commit the catalogue
// records (catalog/apps/catalog.json › thumb.src), cut to 16:10 and 640 × 400 px, at most 60 KB.
// Apps whose repository holds no screenshot have `thumb: null` and keep Lens's drawn tile.
//
// Fetching uses git (a shallow, tree-less fetch of the pinned commit, then the one blob), like
// tools/site/fetch-app-media.mjs, so it works wherever github.com is reachable.
// Usage: node tools/site/app-thumbs.mjs [--force]
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const cache = join(here, ".cache/app-media");
mkdirSync(cache, { recursive: true });
const force = process.argv.includes("--force");
const { apps } = JSON.parse(readFileSync(join(root, "catalog/apps/catalog.json"), "utf8"));

// Where a source isn't already 16:10, the part of it to keep: [left, top, right, bottom] as fractions.
const CROP = {
  // The Settings window and a little of the desktop around it (the shot is a tall window on a photo).
  ollama: [0.044, 0.047, 0.956, 0.65],
};

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

// 16:10 at 640 × 400. Close to 16:10: cover, anchored to the top (title bars and toolbars stay).
// Far from it: the whole shot, centred on a blurred, darkened copy of itself (no letterbox bars).
const PY = `
import sys, json
from PIL import Image, ImageFilter, ImageEnhance
src, dest, crop = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
W, H = 640, 400
im = Image.open(src); im.seek(0); im = im.convert("RGB")
if crop:
    l, t, r, b = crop
    im = im.crop((round(l * im.width), round(t * im.height), round(r * im.width), round(b * im.height)))
ar = im.width / im.height
if abs(ar / 1.6 - 1) <= 0.16:
    k = max(W / im.width, H / im.height)
    im = im.resize((max(W, round(im.width * k)), max(H, round(im.height * k))), Image.LANCZOS)
    x = (im.width - W) // 2
    out = im.crop((x, 0, x + W, H))
else:
    k = max(W / im.width, H / im.height)
    bg = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(18))).enhance(0.45)
    k = min(W / im.width, H / im.height)
    fg = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    out = bg
for q in (86, 80, 74, 68, 62, 56, 50):
    out.save(dest, "WEBP", quality=q, method=6)
    import os
    if os.path.getsize(dest) <= 60 * 1024: break
`;

const outDir = join(root, "docs/media/apps");
mkdirSync(outDir, { recursive: true });
let made = 0, kept = 0;
const none = [];
for (const a of apps) {
  if (!a.thumb) { if ("thumb" in a) none.push(a.id); continue; }
  const dest = join(root, a.thumb.site);
  if (existsSync(dest) && !force) { kept++; continue; }
  const raw = join(cache, `${a.id}-thumb.src`);
  try {
    fetchBlob(a.thumb.src, raw);
    execFileSync("python3", ["-I", "-c", PY, raw, dest, JSON.stringify(CROP[a.id] ?? null)]);
    made++;
    console.log(`[app-thumbs] ${a.id}: ${Math.round(statSync(dest).size / 1024)} KB`);
  } catch (e) {
    console.warn(`[app-thumbs] ${a.id}: ${String(e.message).split("\n")[0]}`);
  }
}
console.log(`[app-thumbs] ${made} made, ${kept} already there; Lens's drawn tile for: ${none.join(", ") || "none"}`);
