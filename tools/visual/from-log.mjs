// Rebuilds golden PNGs from a CI log produced with VISUAL_EMIT_B64=1 (see tools/visual/run.mjs).
//   gh api repos/<owner>/<repo>/actions/jobs/<job id>/logs > job.log
//   node tools/visual/from-log.mjs job.log tools/parity/golden
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [log, dest = "tools/parity/golden"] = process.argv.slice(2);
mkdirSync(dest, { recursive: true });
const parts = {};
for (const line of readFileSync(log, "utf8").split(/\r?\n/)) {
  const i = line.indexOf("VISUALB64|");
  if (i < 0) continue;
  const [, name, idx, total, data] = line.slice(i).split("|");
  (parts[name] ??= { total: +total, chunks: [] }).chunks[+idx] = data.trim();
}
let n = 0;
for (const [name, p] of Object.entries(parts)) {
  if (p.chunks.filter(Boolean).length !== p.total) { console.log(`incomplete: ${name}`); continue; }
  writeFileSync(join(dest, `${name}.png`), Buffer.from(p.chunks.join(""), "base64"));
  n++;
}
console.log(`[visual] wrote ${n} PNGs to ${dest}`);
