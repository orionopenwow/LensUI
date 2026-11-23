// Rewrites raw durations and easing curves inside CSS `transition` declarations to the Lens motion
// tokens (src/styles/motion.css). Idempotent. Usage: node tools/polish/tokenize-motion.mjs <file.css>...
// Durations above 400ms (ambient loops, slow reveals) are left alone on purpose.
import { readFileSync, writeFileSync } from "node:fs";

const CURVES = [
  [/cubic-bezier\(\s*0\.22,\s*1,\s*0\.36,\s*1\s*\)/g, "var(--lens-ease-out)"],
  [/cubic-bezier\(\s*0\.25,\s*0\.8,\s*0\.25,\s*1\s*\)/g, "var(--lens-ease-out)"],
  [/cubic-bezier\(\s*0\.2,\s*0\.9,\s*0\.3,\s*1\s*\)/g, "var(--lens-ease-out)"],
  [/cubic-bezier\(\s*0\.3,\s*0\.8,\s*0\.4,\s*1\s*\)/g, "var(--lens-ease-out)"],
  [/cubic-bezier\(\s*0\.33,\s*0\.9,\s*0\.4,\s*1\s*\)/g, "var(--lens-ease-out)"],
  [/cubic-bezier\(\s*0\.65,\s*0,\s*0\.35,\s*1\s*\)/g, "var(--lens-ease-in-out)"],
  [/cubic-bezier\(\s*0\.32,\s*0,\s*0\.67,\s*0\s*\)/g, "var(--lens-ease-exit)"],
  [/(?<![-\w])ease-in-out\b/g, "var(--lens-ease-in-out)"],
  [/(?<![-\w])ease-out\b/g, "var(--lens-ease-out)"],
  [/(?<![-\w])ease-in\b(?!-)/g, "var(--lens-ease-exit)"],
  [/(?<![-\w])ease\b(?!-)/g, "var(--lens-ease-out)"],
];

export function durToken(ms) {
  if (ms < 40) return null; // 0–40ms are deliberate (reduced motion, instant snaps)
  if (ms <= 95) return "var(--lens-dur-instant)";
  if (ms <= 165) return "var(--lens-dur-fast)";
  if (ms <= 205) return "var(--lens-dur-base)";
  if (ms <= 280) return "var(--lens-dur-slow)";
  if (ms <= 400) return "var(--lens-dur-slower)";
  return null;
}

export function tokenizeCss(css) {
  let changed = 0;
  const out = css.replace(/(\btransition(?:-duration|-timing-function)?\s*:)([^;{}]*)(;|\})/g, (m, head, value, end) => {
    let v = value;
    v = v.replace(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g, (d, n, unit) => {
      const ms = unit === "s" ? parseFloat(n) * 1000 : parseFloat(n);
      const t = durToken(ms);
      return t ?? d;
    });
    for (const [re, rep] of CURVES) v = v.replace(re, rep);
    if (v !== value) changed++;
    return head + v + end;
  });
  return { out, changed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let total = 0;
  for (const f of process.argv.slice(2)) {
    const { out, changed } = tokenizeCss(readFileSync(f, "utf8"));
    if (changed) writeFileSync(f, out);
    total += changed;
    console.log(`${String(changed).padStart(3)}  ${f}`);
  }
  console.log(`[tokenize-motion] ${total} declarations rewritten`);
}
