// Window-button blend parity (docs/WINDOW_STYLING.md → "Window buttons blend").
//
// Runs Lens's real overlay code (src-tauri/src/caption_paint.rs, built with plain `rustc` through
// cli.rs) over every title bar Lens can meet × state × window mode × button order × scale, and
// fails if any pixel outside the three buttons differs from the title bar underneath by more than
// TOLERANCE in any channel. Writes before/after strips and contact sheets to tools/parity/caption/out.
//
// Env: CAPTION_TOLERANCE (default 2), CAPTION_SHOTS=0 to skip writing images.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const out = join(here, "out");
const shots = join(out, "shots");
rmSync(out, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });
const TOLERANCE = Number(process.env.CAPTION_TOLERANCE || 2);
const WRITE_SHOTS = process.env.CAPTION_SHOTS !== "0";

// 1. Build the CLI from the same source file the app uses.
const cli = join(out, process.platform === "win32" ? "caption-cli.exe" : "caption-cli");
execFileSync("rustc", ["--edition", "2021", "-O", join(here, "cli.rs"), "-o", cli], { stdio: "inherit" });

// 2. Every theme pack's title-bar colour (Lens sets the caption to the pack's surface; Obsidian
//    has no `base` and uses the engine default, src-tauri/src/commands/theme.rs frame_colors).
await build({
  entryPoints: [join(root, "src/themes/packs.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(out, "packs.mjs"),
  logLevel: "error",
});
const packsMod = await import(pathToFileURL(join(out, "packs.mjs")).href);
const packs = [...packsMod.THEME_PACKS, ...(packsMod.COMMUNITY_PACKS || [])];

/** Title bars: [name, active caption, inactive caption, gradient (Mica-like), content below]. */
const BARS = [];
for (const p of packs) {
  const cap = (p.base || "#0C0C0F").replace("#", "");
  const content = p.scheme === "light" ? "FFFFFF" : "111113";
  BARS.push([`lens-${p.id}`, cap, cap, false, content]);
}
BARS.push(
  ["windows-dark", "202020", "2B2B2B", false, "191919"],
  ["windows-light", "FFFFFF", "F3F3F3", false, "FFFFFF"],
  ["windows-accent", "0078D4", "F3F3F3", false, "FFFFFF"],
  ["mica-dark", "202020", "2C2C2C", true, "1C1C1C"],
  ["mica-light", "F3F3F3", "FAFAFA", true, "FFFFFF"],
  ["chromium-dark", "202124", "35363A", false, "35363A"],
);

/** Window modes: [name, overlay base height, real caption rows, corner]. */
const MODES = [
  ["normal", 31, 31, 8],
  ["maximised", 22, 22, 0], // DWM reports the shorter caption
  ["maximised-no-bounds", 31, 22, 0], // DWM bounds missing: overlay taller than the caption
  ["chromium", 38, 38, 8],
];
const ORDERS = [
  [0, "yellow-green-red"],
  [1, "green-yellow-red"],
  [2, "red-yellow-green"],
];
const DPIS = [96, 120, 144, 192, 240];
// windowControls.style and windowControls.position. Every style and both sides run on every title
// bar; the default (classic, right) runs the full order × scale grid above, the others one order at
// three scales, since order and scale don't change how a style or a side blends.
const STYLES = [
  [0, "classic"],
  [1, "soft"],
  [2, "dots"],
  [3, "pills"],
];
const SIDES = [
  [0, "right"],
  [1, "left"],
];

const cases = [];
for (const [bar, active, inactive, gradient, content] of BARS) {
  for (const [state, cap] of [["active", active], ["inactive", inactive]]) {
    for (const [mode, baseH, capRows, corner] of MODES) {
      if (mode === "chromium" && !bar.startsWith("chromium")) continue;
      for (const [order, orderName] of ORDERS) {
        for (const dpi of DPIS) {
          for (const hovered of [0, 1]) {
            if (hovered && !(order === 0 && (dpi === 96 || dpi === 144))) continue;
            const name = `${bar}_${state}_${mode}_${orderName}_${dpi}${hovered ? "_hover" : ""}`;
            cases.push({ name, bar, state, mode, orderName, dpi, hovered, args: [join(shots, `${name}.ppm`), dpi, order, hovered, corner, cap, baseH, capRows, gradient ? 1 : 0, content] });
          }
        }
      }
      for (const [style, styleName] of STYLES) {
        for (const [side, sideName] of SIDES) {
          if (style === 0 && side === 0) continue;
          for (const dpi of [96, 144, 192]) {
            for (const hovered of [0, 1]) {
              if (hovered && dpi !== 144) continue;
              const name = `${bar}_${state}_${mode}_${styleName}_${sideName}_${dpi}${hovered ? "_hover" : ""}`;
              cases.push({ name, bar, state, mode, orderName: `${styleName} ${sideName}`, dpi, hovered, args: [join(shots, `${name}.ppm`), dpi, 0, hovered, corner, cap, baseH, capRows, gradient ? 1 : 0, content, `style=${style}`, `side=${side}`] });
            }
          }
        }
      }
    }
  }
}

// The check must be able to fail: the old single-colour overlay over a gradient title bar and over
// a caption shorter than the overlay. These two controls are expected NOT to blend.
const controls = [
  [join(out, "control-gradient.ppm"), 144, 0, 0, 8, "202020", 31, 31, 1, "1C1C1C", "single"],
  [join(out, "control-short-caption.ppm"), 144, 0, 0, 0, "202020", 31, 22, 0, "FFFFFF", "single"],
];
const ctl = execFileSync(cli, { input: controls.map((c) => c.join(" ")).join("\n") + "\n" }).toString().trim().split("\n").map((l) => Number(l.split(" ")[0]));
for (const c of controls) rmSync(c[0], { force: true });
if (!ctl.every((d) => d > TOLERANCE)) {
  console.log(`[parity:caption] FAIL: the check did not catch the old single-colour overlay (differences ${ctl.join(", ")})`);
  process.exit(1);
}

// 3. Run them all in one process.
const res = execFileSync(cli, { input: cases.map((c) => c.args.join(" ")).join("\n") + "\n", maxBuffer: 64 << 20 }).toString().trim().split("\n");
let failed = 0;
let pixels = 0;
const fails = [];
cases.forEach((c, i) => {
  const [delta, n] = res[i].split(" ").map(Number);
  c.delta = delta;
  pixels += n;
  if (!(delta <= TOLERANCE) || n === 0) {
    failed++;
    fails.push(`${c.name}: max channel difference ${delta} (pixels checked ${n})`);
  }
});

// 4. PNGs and contact sheets.
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function ppmToPng(path) {
  const buf = readFileSync(path);
  const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.toString("latin1", 0, 32));
  const [w, h] = [Number(m[1]), Number(m[2])];
  const px = buf.subarray(m[0].length);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  writeFileSync(path.replace(/\.ppm$/, ".png"), png);
  rmSync(path);
}
if (WRITE_SHOTS) {
  for (const c of cases) ppmToPng(c.args[0]);
  for (const dpi of DPIS) {
    const cells = cases
      .filter((c) => c.dpi === dpi && !c.hovered)
      .map((c) => `<figure class="${c.delta > TOLERANCE ? "bad" : ""}"><img src="shots/${c.name}.png"><figcaption>${c.bar} · ${c.state} · ${c.mode} · ${c.orderName} · Δ${c.delta}</figcaption></figure>`)
      .join("");
    writeFileSync(join(out, `sheet-${dpi}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Window buttons ${dpi} DPI</title></head><body style="margin:0;background:#777;color:#111;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px">${cells}</div><style>figure{margin:0}img{max-width:100%;display:block;image-rendering:pixelated}figure.bad{outline:3px solid red}</style></body></html>`);
  }
} else {
  for (const c of cases) rmSync(c.args[0], { force: true });
}

const summary = { cases: cases.length, failed, pixels, tolerance: TOLERANCE, bars: BARS.length, modes: MODES.map((m) => m[0]), orders: ORDERS.map((o) => o[1]), styles: STYLES.map((s) => s[1]), sides: SIDES.map((s) => s[1]), dpis: DPIS, worst: Math.max(...cases.map((c) => c.delta)) };
writeFileSync(join(out, "report.json"), JSON.stringify({ ...summary, fails }, null, 2));
console.log(`[parity:caption] ${cases.length} cases (${BARS.length} title bars × active/inactive × ${MODES.length} window modes × 3 orders × ${DPIS.length} scales, plus ${STYLES.length} styles × ${SIDES.length} sides, hover on a subset), ${pixels} pixels checked, worst difference ${summary.worst}, tolerance ${TOLERANCE}; the old single-colour overlay differs by ${ctl.join(" and ")} on the controls`);
if (failed) {
  console.log(fails.slice(0, 30).join("\n"));
  console.log(`[parity:caption] FAIL: ${failed} case(s) do not blend`);
  process.exit(1);
}
console.log("[parity:caption] every case blends");
