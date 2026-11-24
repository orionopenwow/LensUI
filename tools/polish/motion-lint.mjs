// Motion lint (docs/SMOOTHNESS.md, R3). Finds the patterns that make Lens animations stutter or
// tear, and holds each file to its recorded count (tools/polish/motion-baseline.json): numbers may
// only go down. New files start at zero.
//
//   node tools/polish/motion-lint.mjs            summary + check against the baseline (exit 1 if grown)
//   node tools/polish/motion-lint.mjs --list     every finding as file:line rule detail
//   node tools/polish/motion-lint.mjs --update   rewrite the baseline to today's counts
//
// Rules
//   transition-all     `transition: all` (animates layout by accident, restyles everything)
//   layout-transition  a transition on width/height/top/left/margin/padding/gap/inset… (layout every frame)
//   layout-keyframes   @keyframes that change those properties
//   timer-animation    setTimeout/setInterval standing in for an animation clock or its end
//   native-resize      the page asks for its native window to be resized or moved (tears mid-animation)
//   backdrop-filter    CSS backdrop blur (costly on see-through WebView2 windows). Counted and reported,
//                      not held to the baseline: a blur is a design choice, the others are defects.
//   inline-animation   animation/transition written as an inline style string (escapes tokens and this lint)
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RULES = ["transition-all", "layout-transition", "layout-keyframes", "timer-animation", "native-resize", "backdrop-filter", "inline-animation"];

const LAYOUT = /^(width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset(-[a-z-]+)?|margin(-[a-z-]+)?|padding(-[a-z-]+)?|gap|row-gap|column-gap|flex-basis|flex-grow|flex|grid-template-(rows|columns)|font-size|line-height|border-width|letter-spacing)$/;
// Commands that resize or move a Lens window when a page calls them.
const RESIZE_CMDS = /invoke\(\s*["'](place_surface_cmd|set_desktop_folder_expanded_cmd|set_settings_content_height_cmd|set_dock_window_size_cmd|resize_[a-z_]+_cmd|[a-z_]+_resize_cmd)["']/g;

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

function splitTop(value) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Findings in CSS text (a .css file, or CSS inside a template string). */
export function lintCss(text, offsetLine = 0) {
  const out = [];
  const css = stripComments(text);
  const add = (rule, index, detail) => out.push({ rule, line: lineOf(css, index) + offsetLine, detail });

  for (const m of css.matchAll(/(?<![\w-])(transition|transition-property)\s*:\s*([^;{}]*)/g)) {
    const props = splitTop(m[2]).map((p) => p.split(/\s+/)[0].toLowerCase());
    if (props.includes("all")) add("transition-all", m.index, "transition: all");
    const bad = props.filter((p) => LAYOUT.test(p));
    if (bad.length) add("layout-transition", m.index, bad.join(", "));
  }
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    // Walk to the matching brace of the keyframes block.
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const body = css.slice(m.index + m[0].length, i - 1);
    const bad = new Set();
    for (const d of body.matchAll(/(?<![\w-])([a-z-]+)\s*:/g)) if (LAYOUT.test(d[1])) bad.add(d[1]);
    if (bad.size) add("layout-keyframes", m.index, `${m[1]}: ${[...bad].join(", ")}`);
  }
  for (const m of css.matchAll(/(?<![\w-])(-webkit-)?backdrop-filter\s*:(?!\s*none)[^;{}]+/g)) {
    if (m[1]) continue; // the -webkit- twin of a declaration counts once
    add("backdrop-filter", m.index, m[0].split(":")[1].trim().slice(0, 60));
  }
  return out;
}

/** Findings in a TS/TSX file. */
export function lintTs(text) {
  const out = [];
  const add = (rule, index, detail) => out.push({ rule, line: lineOf(text, index), detail });
  const src = text.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

  // Inline style strings: transition: "…" / animation: "…"
  for (const m of src.matchAll(/(?<![\w-])(transition|animation)\s*:\s*(["'`])([^"'`]*)\2/g)) {
    add("inline-animation", m.index, `${m[1]}: ${m[3].slice(0, 50)}`);
    if (m[1] === "transition") {
      const props = splitTop(m[3]).map((p) => p.split(/\s+/)[0].toLowerCase());
      if (props.includes("all")) add("transition-all", m.index, "transition: all");
      const bad = props.filter((p) => LAYOUT.test(p.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())));
      if (bad.length) add("layout-transition", m.index, bad.join(", "));
    }
  }
  for (const m of src.matchAll(/backdropFilter\s*:\s*(["'`])(?!\s*none)/g)) add("backdrop-filter", m.index, "inline backdropFilter");
  // CSS inside <style>{`…`}</style> blocks.
  for (const m of src.matchAll(/<style[^>]*>\s*\{\s*`([\s\S]*?)`\s*\}\s*<\/style>/g)) {
    for (const f of lintCss(m[1], lineOf(src, m.index) - 1)) out.push(f);
  }
  // Timers as animation clocks: a timer whose callback (the next few lines) writes element styles,
  // or flips a closing/leaving/phase flag after a hard-coded delay that mirrors a CSS duration.
  for (const m of src.matchAll(/\bset(Timeout|Interval)\s*\(/g)) {
    const win = src.slice(m.index, m.index + 420);
    const end = win.search(/\n\s*\n/);
    const body = end > 0 ? win.slice(0, end) : win;
    const writesStyle = /\.style\.(transform|opacity|left|top|width|height|setProperty)|\.style\[/.test(body) || /\.classList\.(add|remove|toggle)\(\s*["'](is-|lens-)/.test(body);
    const flipsPhase = /set\w*(Closing|Leaving|Exiting|Phase|Hiding|Entering|Collaps\w*|Expand\w*Done)\s*\(/.test(body) && /,\s*\d{2,4}\s*\)/.test(body);
    if (writesStyle || flipsPhase) add("timer-animation", m.index, m[1] === "Interval" ? "setInterval" : "setTimeout");
  }
  for (const m of src.matchAll(/\.(setSize|setPosition|setMinSize|setMaxSize)\s*\(/g)) add("native-resize", m.index, m[1]);
  for (const m of src.matchAll(RESIZE_CMDS)) add("native-resize", m.index, m[1]);
  return out;
}

export function lintSource(file, text) {
  if (file.endsWith(".css")) return lintCss(text);
  if (/\.(tsx?|mts)$/.test(file)) return lintTs(text);
  return [];
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "types") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** { "src/x.css": { "layout-transition": 2, … }, … } with only non-zero entries, plus the findings. */
export function lintTree(root) {
  const src = join(root, "src");
  const counts = {};
  const findings = [];
  for (const f of walk(src).sort()) {
    const rel = relative(root, f).split(sep).join("/");
    // The motion engine is where the allowed primitives live.
    if (rel.startsWith("src/ui/motion/")) continue;
    for (const x of lintSource(f, readFileSync(f, "utf8"))) {
      findings.push({ file: rel, ...x });
      (counts[rel] ??= {})[x.rule] = (counts[rel][x.rule] ?? 0) + 1;
    }
  }
  return { counts, findings };
}

export function totals(counts) {
  const t = Object.fromEntries(RULES.map((r) => [r, 0]));
  for (const f of Object.values(counts)) for (const [r, n] of Object.entries(f)) t[r] += n;
  return t;
}

/** Reported but never failed on. */
export const ADVISORY = new Set(["backdrop-filter"]);

/** Files and rules whose count is above the baseline. */
export function grown(counts, baseline) {
  const out = [];
  for (const [file, rules] of Object.entries(counts)) {
    for (const [rule, n] of Object.entries(rules)) {
      if (ADVISORY.has(rule)) continue;
      const allowed = baseline[file]?.[rule] ?? 0;
      if (n > allowed) out.push(`${file}: ${rule} ${n} > ${allowed}`);
    }
  }
  return out;
}

export const BASELINE = "tools/polish/motion-baseline.json";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const { counts, findings } = lintTree(root);
  const basePath = join(root, BASELINE);
  if (process.argv.includes("--list")) {
    for (const f of findings) console.log(`${f.file}:${f.line} ${f.rule} ${f.detail}`);
  }
  if (process.argv.includes("--update")) {
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((k) => [k, Object.fromEntries(Object.keys(counts[k]).sort().map((r) => [r, counts[k][r]]))]));
    writeFileSync(basePath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`[motion-lint] baseline written: ${Object.keys(sorted).length} files`);
  }
  const t = totals(counts);
  console.log("[motion-lint] " + RULES.map((r) => `${r} ${t[r]}`).join(" · "));
  const baseline = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf8")) : {};
  const bad = grown(counts, baseline);
  if (bad.length) {
    console.error("[motion-lint] grew past the baseline (use src/ui/motion instead; see docs/SMOOTHNESS.md):\n  " + bad.join("\n  "));
    process.exit(1);
  }
}
