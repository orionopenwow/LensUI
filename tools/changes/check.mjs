// Every OS writer must be in the change registry (src-tauri/src/changes.rs).
//
// Scans src-tauri/src for calls that change Windows outside Lens' own data folder: registry
// writes and deletes, SystemParametersInfo setters, hooks and hotkeys, and `reg add/delete/import`.
// A file that makes such a call must be named in a registry row's `sources` (so it has an undo
// that "Remove all Lens changes" runs) or in `NOT_CHANGES` with the reason nothing is left behind.
// Also fails when the registry names a file that does not exist.
//
//   node tools/changes/check.mjs          # exit 1 on any unregistered writer
//   node tools/changes/check.mjs --list   # print what each file calls
//
// Standard library only; runs anywhere (CI runs it on Linux in build.yml).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const src = join(root, "src-tauri/src");

export const WRITERS = [
  /\bReg(?:SetValueExW|SetKeyValueW|CreateKeyExW|CreateKeyW|DeleteValueW|DeleteKeyW|DeleteKeyExW|DeleteKeyValueW|DeleteTreeW)\b/g,
  /\bSPI_SET[A-Z]+\b/g,
  /\b(?:SetWindowsHookExW|SetWinEventHook|RegisterHotKey|SetSystemCursor)\b/g,
  /Command::new\("reg(?:\.exe)?"\)[\s\S]{0,240}?"(?:add|delete|import)"/g,
];

/** Rust source without `//` comments, so prose that names an API does not count. */
export function stripComments(text) {
  return text
    .split("\n")
    .map((line) => {
      // A `//` outside a string literal starts a comment; one inside (a URL) does not.
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "\\" && inString) i++;
        else if (ch === '"') inString = !inString;
        else if (!inString && ch === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

/** Names of the writing APIs a source text calls. */
export function writersIn(text) {
  const code = stripComments(text);
  const found = new Set();
  for (const re of WRITERS) {
    for (const m of code.matchAll(re)) found.add(m[0].startsWith("Command::new") ? "reg.exe write" : m[0]);
  }
  return [...found].sort();
}

/** `sources` of every row plus the NOT_CHANGES file names, from the registry's own text. */
export function registered(registryText) {
  const code = stripComments(registryText);
  const sources = new Set();
  for (const m of code.matchAll(/sources:\s*&\[([\s\S]*?)\]/g)) {
    for (const s of m[1].matchAll(/"([^"]+\.rs)"/g)) sources.add(s[1]);
  }
  const exempt = new Set();
  const block = code.match(/pub const NOT_CHANGES[\s\S]*?=\s*&\[([\s\S]*?)\n\s*\];/);
  if (block) for (const m of block[1].matchAll(/\(\s*"([^"]+\.rs)"/g)) exempt.add(m[1]);
  return { sources, exempt };
}

function rustFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "tests") rustFiles(p, out);
    } else if (name.endsWith(".rs") && name !== "tests.rs") out.push(p);
  }
  return out;
}

export function check() {
  const registryPath = join(src, "changes.rs");
  const { sources, exempt } = registered(readFileSync(registryPath, "utf8"));
  const problems = [];
  const calls = {};
  for (const file of rustFiles(src)) {
    const rel = relative(src, file).replaceAll("\\", "/");
    if (rel === "changes.rs") continue;
    const found = writersIn(readFileSync(file, "utf8"));
    if (!found.length) continue;
    calls[rel] = found;
    if (!sources.has(rel) && !exempt.has(rel)) {
      problems.push(`${rel} calls ${found.join(", ")} but is not in the change registry. Add a row with its undo to src-tauri/src/changes.rs (or to NOT_CHANGES with the reason nothing is left behind).`);
    }
  }
  for (const rel of [...sources, ...exempt]) {
    if (!existsSync(join(src, rel))) problems.push(`changes.rs names ${rel}, which does not exist.`);
  }
  for (const rel of exempt) {
    if (!calls[rel]) problems.push(`NOT_CHANGES lists ${rel}, which no longer calls a writing API. Remove the entry.`);
  }
  return { problems, calls, rows: sources.size, exempt: exempt.size };
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const r = check();
  if (process.argv.includes("--list")) for (const [f, c] of Object.entries(r.calls)) console.log(`${f}: ${c.join(", ")}`);
  if (r.problems.length) {
    for (const p of r.problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log(`change registry covers every OS writer: ${Object.keys(r.calls).length} file(s) with writers, ${r.rows} registered source(s), ${r.exempt} exempt.`);
}
