// Lens Mission Control must never ship (docs/MISSION_CONTROL.md). CI runs this after every
// frontend build (build.yml) and before the release build (release.yml):
//
//   node tools/mission/guard.mjs            # configs only
//   node tools/mission/guard.mjs dist       # configs + the built bundle in dist/
//
// Fails when a release/build config could turn the `admin` feature or LENS_ADMIN on, when
// tauri.conf.json declares the window, or when the bundle contains Mission Control's code.
// Standard library only.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");
const problems = [];

// 1. Cargo: `admin` exists, is not a default, and nothing else enables it.
const cargo = read("src-tauri/Cargo.toml");
const feat = cargo.slice(cargo.indexOf("[features]"), cargo.indexOf("\n[", cargo.indexOf("[features]") + 1));
if (!/^admin = \[\]$/m.test(feat)) problems.push("src-tauri/Cargo.toml: [features] must declare admin = [] and nothing else may enable it");
if (/^default\s*=.*admin/m.test(feat)) problems.push("src-tauri/Cargo.toml: admin is a default feature");
if (/"admin"/.test(cargo)) problems.push('src-tauri/Cargo.toml: something lists "admin"');

// 2. Release and installer paths never pass it.
const BANNED = [/--features[= ]+[^\n]*\badmin\b/, /-f admin\b/, /LENS_ADMIN\s*[=:]\s*["']?1/];
for (const f of [".github/workflows/release.yml", "Build-Lens-UI.bat", "src-tauri/tauri.conf.json", "package.json"]) {
  const t = read(f);
  for (const re of BANNED) if (re.test(t)) problems.push(`${f}: enables Mission Control (${re})`);
}
for (const line of read(".github/workflows/build.yml").split("\n")) {
  if (/tauri build/.test(line) && /admin|LENS_ADMIN/.test(line)) problems.push(`build.yml: the installer build enables admin: ${line.trim()}`);
}
if (/missioncontrol/.test(read("src-tauri/tauri.conf.json"))) problems.push("tauri.conf.json declares the missioncontrol window (it must be built at runtime, admin only)");

// 3. Vite only defines it true for the dev server with LENS_ADMIN=1.
if (!read("vite.config.ts").includes('command === "serve" && process.env.LENS_ADMIN === "1"')) problems.push("vite.config.ts: __LENS_ADMIN__ must be true only for `serve` with LENS_ADMIN=1");

// 4. The built bundle has none of Mission Control's code.
const dist = process.argv[2] ? resolve(root, process.argv[2]) : null;
if (dist) {
  if (!existsSync(dist)) problems.push(`${process.argv[2]}: not built`);
  else {
    const MARKERS = ["data-mission-control", "MissionControlSurface", "mc_status", "mc_apply", "LensMissionControl"];
    const walk = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|css|html|json)$/.test(n)) {
          const t = readFileSync(p, "utf8");
          for (const m of MARKERS) if (t.includes(m)) problems.push(`${p.slice(root.length + 1)} contains "${m}"`);
        }
      }
    };
    walk(dist);
  }
}

if (problems.length) {
  console.log(`[mission-guard] Mission Control could reach a release:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`[mission-guard] ok: admin is dev-only${dist ? `, and ${process.argv[2]} has no Mission Control code` : ""}`);
