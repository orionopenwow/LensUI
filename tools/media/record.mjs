// Records the short feature clips used by README.md and the website (docs/media/).
//
// Every clip is rendered from the real Lens frontend in a headless browser, using the parity
// harnesses (tools/parity/**) and their mocked Tauri backend. Two kinds:
//   live    a Playwright screen recording of scripted interaction (hover, typing, events)
//   frames  a slideshow of gallery states with short crossfades
// Each clip becomes <id>.mp4 (H.264), <id>.gif (fallback, ≤ 2.5 MB) and <id>.webp (poster).
//
// Usage:
//   node tools/media/record.mjs                 # every clip whose gallery is available
//   node tools/media/record.mjs dock-magnify    # only these ids
// Galleries that live on feature branches not merged yet are found through env vars, e.g.
//   LENS_GALLERY_VOICE=/path/to/checkout-of-feature-voice   (see docs/media/README.md)
// Build the galleries first (each has a build.mjs; see docs/media/README.md).
import { createServer } from "node:http";
import { readFile, mkdir, rm, writeFile, stat, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = join(root, "docs/media");
const tmp = join(here, ".tmp");
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

// ---- galleries ------------------------------------------------------------------------------
// name → [env var for an alternative checkout, folder to serve, page path]
const repo = (name) => process.env[`LENS_GALLERY_${name.toUpperCase()}`] || root;
const GALLERIES = {
  main: () => [join(root, "tools/parity/out"), "harness.html"],
  command: () => [join(root, "tools/parity/command"), "out/harness.html"],
  ai: () => [join(root, "tools/parity/ai/out"), "index.html"],
  tester: () => [join(root, "tools/parity/tester"), "out/harness.html"],
  playground: () => [join(root, "docs/site"), "../../tools/media/playground.html"],
  voice: () => [join(repo("voice"), "tools/parity/voice/out"), "index.html"],
  browser: () => [join(repo("browser"), "tools/parity/browser"), "out/harness.html"],
  guide: () => [join(repo("guide"), "tools/parity/guide"), "out/harness.html"],
  rightclick: () => [join(repo("rightclick"), "tools/parity/rightclick/out"), "index.html"],
  snip: () => [join(repo("snip"), "tools/parity/snip"), "out/harness.html"],
  approval: () => [join(repo("control"), "tools/parity/approval"), "out/harness.html"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (page, event, payload) => page.evaluate(([e, p]) => globalThis.__lensEmit?.(e, p), [event, payload]);
const patchConfig = (page, patch) =>
  page.evaluate((p) => {
    const merge = (a, b) => {
      if (!b || typeof b !== "object" || Array.isArray(b)) return b;
      const o = { ...(a ?? {}) };
      for (const k of Object.keys(b)) o[k] = merge(a?.[k], b[k]);
      return o;
    };
    const next = merge(globalThis.__lensConfig(), p);
    globalThis.__lensSetConfig(next);
    globalThis.__lensEmit("lens://config-updated", next);
  }, patch);
// A plain desktop backdrop behind transparent surfaces (the dock, the pointer overlay).
const desktopBg = (page) =>
  page.evaluate(() => {
    const d = document.createElement("div");
    d.setAttribute("aria-hidden", "true");
    d.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(1400px 700px at 28% 12%, #23242c 0%, #121217 45%, #09090b 100%)";
    document.body.prepend(d);
    document.documentElement.style.background = "#09090b";
  });
async function sweep(page, from, to, steps = 40, ms = 16) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
    await sleep(ms);
  }
}
const center = async (page, sel, n = 0) => {
  const b = await page.locator(sel).nth(n).boundingBox();
  return b ? [b.x + b.width / 2, b.y + b.height / 2] : null;
};

// ---- clips ----------------------------------------------------------------------------------
const PACK_CYCLE = ["obsidian", "catppuccin-mocha", "tokyo-night", "nord-frost", "gruvbox-warm", "alabaster-daylight", "rose-pine", "hyprland-neon"];

export const CLIPS = [
  {
    id: "dock-magnify", posterAt: 2.2, title: "Dock: hover magnification and a bounce launch", gallery: "main", kind: "live",
    url: "?surface=dock&preset=obsidian", size: [1000, 260], bg: true,
    async play(page) {
      await patchConfig(page, { dock: { magnification: "classic", magnificationRange: 2, launchAnimation: "bounce" }, topBar: { enabled: false } });
      await sleep(400);
      const a = await center(page, ".dock-item-wrap", 1), b = await center(page, ".dock-item-wrap", 8);
      await page.mouse.move(a[0] - 80, a[1] - 60);
      await sweep(page, [a[0] - 40, a[1]], [b[0] + 30, b[1]], 70, 22);
      await sweep(page, [b[0] + 30, b[1]], [a[0] + 120, a[1]], 50, 22);
      await page.mouse.click(a[0] + 120, a[1]).catch(() => {});
      await sleep(900);
      await page.mouse.move(a[0], a[1] - 160);
      await sleep(500);
    },
  },
  {
    id: "dock-styles", posterAt: 2.6, title: "Six dock styles: floating, slim, taskbar, studio, minimal, split", gallery: "main", kind: "live",
    url: "?surface=dock&preset=obsidian", size: [1100, 240], bg: true,
    async play(page) {
      await patchConfig(page, { topBar: { enabled: false } });
      for (const style of ["floating", "slim", "taskbar", "studio", "minimal", "split", "floating"]) {
        await patchConfig(page, { dock: { style } });
        await page.evaluate((s) => { document.body.dataset.mediaLabel = s; }, style);
        await sleep(1100);
      }
    },
  },
  {
    id: "dock-search", posterAt: 2.4, title: "Search opens inside the dock; the dock never gets wider", gallery: "main", kind: "live",
    url: "?surface=dock&preset=obsidian", size: [1000, 300], bg: true,
    async play(page) {
      await patchConfig(page, { topBar: { enabled: false } });
      await sleep(500);
      const s = await center(page, ".dock-search-mag-btn");
      await sweep(page, [s[0] + 200, s[1] - 80], s, 20, 16);
      await page.mouse.click(s[0], s[1]);
      await sleep(700);
      await page.keyboard.type("spo", { delay: 160 });
      await sleep(1400);
      await page.keyboard.press("Escape");
      await sleep(900);
    },
  },
  {
    id: "music", posterAt: 1.8, title: "Music: now playing in the dock, with controls on hover", gallery: "main", kind: "live",
    url: "?surface=dock&preset=obsidian", size: [1000, 320], bg: true,
    async play(page) {
      await patchConfig(page, { topBar: { enabled: false } });
      await sleep(400);
      const a = await center(page, ".dock-item-wrap", 3), m = await center(page, ".dock-item-wrap", 6);
      await page.mouse.move(a[0], a[1]);
      await sweep(page, a, m, 30, 20);
      await sleep(2200);
      await sweep(page, m, [m[0], m[1] - 120], 20, 20);
      await sleep(600);
    },
  },
  {
    id: "themes", title: "Theme packs restyle every surface at once", gallery: "main", kind: "live",
    url: "?surface=settings&preset=obsidian", size: [1000, 620],
    async setup(page) {
      await page.locator("text=Theme & Look").first().click().catch(() => {});
    },
    async play(page) {
      for (const preset of PACK_CYCLE) {
        await patchConfig(page, { theme: { preset } });
        await sleep(1000);
      }
    },
  },
  {
    id: "focus-borders", title: "Dim inactive windows and a gradient border on the active one", gallery: "main", kind: "live",
    url: "?surface=focusdim&styling=demo&preset=obsidian", size: [960, 560], bg: true,
    async play(page) { await sleep(3500); },
  },
  {
    id: "playground-sand", posterAt: 8, title: "Falling Sand: paint sand, water, fire and vines on your wallpaper", gallery: "playground", kind: "live",
    url: "?scene=sand&preset=obsidian", size: [960, 540],
    async play(page) {
      await sleep(400);
      const path = [[200, 140], [380, 120], [560, 150], [740, 130]];
      await page.mouse.move(...path[0]);
      await page.mouse.down();
      for (let i = 0; i < path.length - 1; i++) await sweep(page, path[i], path[i + 1], 30, 30);
      await page.mouse.up();
      await sleep(900);
      await page.keyboard.press("2").catch(() => {});
      await page.mouse.move(480, 90);
      await page.mouse.down();
      await sweep(page, [480, 90], [520, 100], 24, 35);
      await page.mouse.up();
      await sleep(1300);
    },
  },
  {
    id: "playground-ink", posterAt: 6, title: "Ink: stir coloured ink with your pointer", gallery: "playground", kind: "live",
    url: "?scene=fluid&preset=tokyo-night", size: [960, 540],
    async play(page) {
      await sleep(300);
      for (let k = 0; k < 2; k++) {
        const pts = Array.from({ length: 9 }, (_, i) => [480 + Math.cos(i * 0.8 + k) * 280, 270 + Math.sin(i * 0.8 + k) * 170]);
        for (let i = 0; i < pts.length - 1; i++) await sweep(page, pts[i], pts[i + 1], 14, 16);
        await page.mouse.click(480, 270);
      }
      await sleep(1500);
    },
  },
  {
    id: "cursor-effects", posterAt: 3.2, title: "Pointer effects: glow trail and click ripples in your accent", gallery: "main", kind: "live",
    url: "?surface=cursorfx&preset=catppuccin-mocha", size: [960, 540], bg: true,
    async play(page) {
      await emit(page, "cursorfx://settings", { ripples: true, glowTrail: true, cometTrail: false, spotlight: false, spotlightRadius: 160, shakeToFind: false, keystrokes: true, keystrokesAll: false, color: "accent", pauseOnBattery: true, respectReducedMotion: true });
      const frame = (x, y, clicks = [], keys = []) => emit(page, "cursorfx://frame", { monitor: { left: 0, top: 0, right: 960, bottom: 540 }, x, y, clicks, keys, shake: false, spotlightToggle: false, wheel: 0, paused: null, t: Date.now() });
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const x = 120 + t * 720, y = 270 + Math.sin(t * Math.PI * 3) * 140;
        const clicks = i % 30 === 15 ? [{ button: i % 60 === 15 ? "left" : "right", x, y }] : [];
        const keys = i === 70 ? ["Ctrl+Shift+S"] : [];
        await frame(x, y, clicks, keys);
        await sleep(30);
      }
      await sleep(900);
    },
  },
  {
    id: "command-mini", posterAt: 3.3, title: "Lens Mini opens at your pointer and expands into Lens Command", gallery: "command", kind: "frames",
    size: [1048, 640], scenes: ["mini-cursor", "mini-answer", "expand-1", "expand-2", "thread"].map((s) => `?scene=${s}&preset=obsidian&w=${s === "thread" ? 800 : 640}`),
  },
  {
    id: "shelf-packs", title: "The Shelf and context packs for Claude", gallery: "rightclick", kind: "frames",
    size: [768, 760], scenes: ["pack", "pack-fits", "toast-saved", "toast-merged"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "right-click", posterAt: 0.6, title: "One right-click menu everywhere, adapting to what you clicked", gallery: "rightclick", kind: "frames",
    size: [768, 760], scenes: ["card", "card-youtube", "card-files", "card-desktop"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "youtube-transcript", title: "YouTube transcripts with timestamps, in Lens Browser", gallery: "browser", kind: "frames",
    size: [1440, 860], scenes: ["transcript"].map((s) => `?scene=${s}&preset=obsidian`), hold: 4,
  },
  {
    id: "voice", posterAt: 3.3, title: "Voice: \"Lens, minimise this\" with live transcript, confirm and undo", gallery: "voice", kind: "frames",
    size: [512, 172], scale: 2, scenes: ["listening", "partial", "thinking", "recognised", "undo"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "approvals", title: "Needs your OK: every risky step waits for you", gallery: "approval", kind: "frames",
    size: [560, 860], scenes: ["element", "look", "window", "hold", "done"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "guide", title: "Lens Guide answers \"how do I…\" and shows you where", gallery: "guide", kind: "frames",
    size: [1100, 760], scenes: ["drawer", "coach"].map((s) => `?scene=${s}&preset=obsidian&tab=${s === "coach" ? "system" : "theme"}`),
  },
  {
    id: "browser-agent", title: "Lens Browser: vertical tabs, spaces and an agent that asks first", gallery: "browser", kind: "frames",
    size: [1440, 860], scenes: ["frame", "agent", "approval"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "snip", title: "Lens Snip: annotate, redact and send before anything is saved", gallery: "snip", kind: "frames",
    size: [1280, 800], scenes: ["select", "studio", "studio-claude", "pin"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "tester-hub", title: "Tester Hub: what's new, today's checklist and a redacted report", gallery: "tester", kind: "frames",
    size: [760, 900], scenes: ["new", "checklist", "report"].map((s) => `?scene=${s}&preset=obsidian`),
  },
  {
    id: "ai-dock", posterAt: 2.2, title: "Ask from the dock: local model first, nothing sent without consent", gallery: "ai", kind: "frames",
    size: [760, 560], scenes: [["dock-ask", ""], ["dock-answer", "&active=ollama&stream=fast"], ["ask-consent", "&active=claude&privacy=ask_each_time"]].map(([s, p]) => `?scene=${s}&preset=obsidian${p}`),
    waits: [500, 1800, 800],
  },
];

// ---- serving ------------------------------------------------------------------------------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".json": "application/json", ".woff2": "font/woff2" };
async function serve(dir) {
  const server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    let file = join(dir, p);
    if (p.startsWith("__media/")) file = join(here, p.slice(8));
    else if (!file.startsWith(dir)) return res.writeHead(403).end();
    try {
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

/** mp4 + gif + poster from a source video (or image sequence filter graph). */
function poster(id, at = 0.6, width = 960) {
  ffmpeg(["-ss", String(at), "-i", join(outDir, `${id}.mp4`), "-frames:v", "1", "-vf", `scale=${Math.min(width, 960)}:-2`, "-c:v", "libwebp", "-quality", "72", join(outDir, `${id}.webp`)]);
}

async function encode(id, inputArgs, width, posterAt) {
  const mp4 = join(outDir, `${id}.mp4`), gif = join(outDir, `${id}.gif`), posterFile = join(outDir, `${id}.webp`);
  const w = Math.min(width, 1280) & ~1;
  ffmpeg([...inputArgs, "-vf", `fps=30,scale=${w}:-2:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
  // GIF: shrink until it fits 2.5 MB.
  for (const [gw, fps] of [[720, 12], [600, 12], [520, 10], [440, 10], [360, 8]]) {
    const gwidth = Math.min(gw, w);
    ffmpeg(["-i", mp4, "-vf", `fps=${fps},scale=${gwidth}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif]);
    if ((await stat(gif)).size <= 2.5 * 1024 * 1024) break;
  }
  poster(id, posterAt, w);
  const sizes = await Promise.all([mp4, gif, posterFile].map(async (f) => (await stat(f)).size));
  return { mp4: sizes[0], gif: sizes[1], poster: sizes[2] };
}

async function recordLive(browser, clip, base, report) {
  const [w, h] = clip.size;
  const vdir = join(tmp, clip.id);
  await rm(vdir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: vdir, size: { width: w, height: h } }, reducedMotion: "no-preference" });
  const born = Date.now();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + clip.page);
  if (clip.bg) await desktopBg(page);
  await sleep(clip.ready ?? 1200);
  if (clip.setup) { await clip.setup(page); await sleep(500); }
  const t0 = (Date.now() - born) / 1000;
  await clip.play(page);
  const t1 = (Date.now() - born) / 1000;
  await ctx.close();
  const webm = join(vdir, (await readdir(vdir)).find((f) => f.endsWith(".webm")));
  const sizes = await encode(clip.id, ["-ss", t0.toFixed(2), "-t", (t1 - t0).toFixed(2), "-i", webm], w, clip.posterAt);
  report.push({ id: clip.id, kind: "live", seconds: +(t1 - t0).toFixed(1), errors, ...sizes });
}

async function recordFrames(browser, clip, base, report) {
  const [w, h] = clip.size;
  const dir = join(tmp, clip.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const errors = [];
  const shots = [];
  for (const [i, q] of clip.scenes.entries()) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: clip.scale ?? 1 });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + clip.pagePath + q);
    await sleep(clip.waits?.[i] ?? 1200);
    const f = join(dir, `${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
    await page.close();
  }
  const hold = clip.hold ?? 1.4, fade = 0.35;
  const inputs = shots.flatMap((f) => ["-loop", "1", "-t", String(hold + fade), "-i", f]);
  let graph = "";
  let last = "[0:v]";
  shots.slice(1).forEach((_, i) => {
    const off = ((i + 1) * hold + i * fade).toFixed(2);
    graph += `${last}[${i + 1}:v]xfade=transition=fade:duration=${fade}:offset=${off}[x${i}];`;
    last = `[x${i}]`;
  });
  const total = shots.length * hold + (shots.length - 1) * fade + fade;
  const tmpMp4 = join(dir, "seq.mp4");
  const pw = (w * (clip.scale ?? 1)) & ~1;
  if (shots.length === 1) ffmpeg([...inputs, "-vf", `fps=30,scale=${pw}:-2`, "-t", String(hold + fade), "-pix_fmt", "yuv420p", tmpMp4]);
  else ffmpeg([...inputs, "-filter_complex", `${graph}${last}fps=30,scale=${pw}:-2,format=yuv420p[out]`, "-map", "[out]", "-t", total.toFixed(2), tmpMp4]);
  const sizes = await encode(clip.id, ["-i", tmpMp4], pw, clip.posterAt);
  report.push({ id: clip.id, kind: "frames", seconds: +total.toFixed(1), errors, ...sizes });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmp, { recursive: true });
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (process.argv.includes("--posters")) {
    // Re-cut poster frames from the existing MP4s (after changing a clip's posterAt).
    for (const c of CLIPS) if ((!only.length || only.includes(c.id)) && existsSync(join(outDir, `${c.id}.mp4`))) poster(c.id, c.posterAt, (c.size[0] * (c.scale ?? 1)) & ~1);
    process.exit(0);
  }
  const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
  const report = [];
  const servers = {};
  for (const clip of CLIPS) {
    if (only.length && !only.includes(clip.id)) continue;
    const [dir, pagePath] = GALLERIES[clip.gallery]();
    const probe = clip.gallery === "playground" ? join(here, "playground.html") : join(dir, pagePath);
    if (!existsSync(probe)) {
      console.log(`skip ${clip.id}: gallery "${clip.gallery}" not built (${probe})`);
      report.push({ id: clip.id, skipped: `gallery ${clip.gallery} not built` });
      continue;
    }
    servers[dir] ??= await serve(clip.gallery === "playground" ? join(root, "docs/site") : dir);
    const { base } = servers[dir];
    clip.pagePath = "/" + (clip.gallery === "playground" ? "__media/playground.html" : pagePath);
    clip.page = clip.pagePath + (clip.url ?? "");
    try {
      if (clip.kind === "live") await recordLive(browser, clip, base, report);
      else await recordFrames(browser, clip, base, report);
      const r = report.at(-1);
      console.log(`ok   ${clip.id.padEnd(18)} ${r.seconds}s  mp4 ${Math.round(r.mp4 / 1024)} KB  gif ${Math.round(r.gif / 1024)} KB${r.errors.length ? "  page errors: " + r.errors.length : ""}`);
    } catch (e) {
      console.log(`FAIL ${clip.id}: ${e.message}`);
      report.push({ id: clip.id, failed: e.message });
    }
  }
  await browser.close();
  for (const s of Object.values(servers)) s.server.close();
  const manifest = CLIPS.map((c) => {
    const r = report.find((x) => x.id === c.id) ?? {};
    return { id: c.id, title: c.title, gallery: c.gallery, kind: c.kind, seconds: r.seconds, mp4: r.mp4, gif: r.gif, poster: r.poster, skipped: r.skipped, failed: r.failed };
  });
  // Merge with clips recorded earlier (so recording a subset keeps the rest).
  const prevPath = join(outDir, "clips.json");
  let prev = [];
  try { prev = JSON.parse(await readFile(prevPath, "utf8")); } catch {}
  const merged = manifest.map((m) => (m.mp4 ? m : prev.find((p) => p.id === m.id && p.mp4) ?? m));
  await writeFile(prevPath, JSON.stringify(merged, null, 2) + "\n");
  await rm(tmp, { recursive: true, force: true });
  if (process.env.MEDIA_COPY_TO) {
    await mkdir(process.env.MEDIA_COPY_TO, { recursive: true });
    for (const f of await readdir(outDir)) await copyFile(join(outDir, f), join(process.env.MEDIA_COPY_TO, f));
  }
}
