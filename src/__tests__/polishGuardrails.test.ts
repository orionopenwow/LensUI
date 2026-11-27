// Wave A guardrails (docs/polish/AAA_WAVE_PLAN.md): keep the polish from eroding.
//  1. Every switch and every icon-only button has an accessible name (a11y F4, statically).
//  2. Motion tokens exist and collapse under reduced motion.
//  3. Files migrated to motion tokens don't regrow raw durations / cubic-beziers.
//  4. Inline style objects only ever go down per file (ratchet).
//  5. No native title= tooltips on DOM elements (DESIGN.md / AGENTS.md).
//  6. src/ui primitives are token-only.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createToastBus, TOAST_MS } from "../ui/toastBus";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const lineOf = (s: string, i: number) => s.slice(0, i).split("\n").length;

/** Opening JSX tags of `name`, brace-aware (attributes can hold arrow functions with `>`). */
function openingTags(src: string, name: string): { tag: string; start: number; end: number }[] {
  const res: { tag: string; start: number; end: number }[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    res.push({ tag: src.slice(m.index, i + 1), start: m.index, end: i + 1 });
  }
  return res;
}
const named = (tag: string) => /aria-label(ledby)?=/.test(tag) || /\{\.\.\./.test(tag);

const TSX = walk(SRC, /\.tsx$/);

describe("accessible names (a11y F4)", () => {
  test("every switch is named", () => {
    const bad: string[] = [];
    for (const f of TSX) {
      const s = readFileSync(f, "utf8");
      for (const el of ["button", "div", "span", "input"]) {
        for (const t of openingTags(s, el)) {
          const isSwitch = /role="switch"/.test(t.tag) || /className=[{"`][^>]*\bcc-toggle\b/.test(t.tag);
          if (!isSwitch || named(t.tag)) continue;
          // A switch with visible text inside is named by its content.
          if (!t.tag.endsWith("/>")) {
            const body = s.slice(t.end, s.indexOf(`</${el}>`, t.end));
            if (/[A-Za-z]{2,}/.test(body.replace(/<[^>]*>/g, "").replace(/\{[^{}]*\}/g, ""))) continue;
            if (/\{[^{}]*"[A-Za-z][^"]*"[^{}]*\}/.test(body)) continue;
          }
          bad.push(`${rel(f)}:${lineOf(s, t.start)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test("every icon-only button is named", () => {
    const bad: string[] = [];
    for (const f of TSX) {
      const s = readFileSync(f, "utf8");
      for (const t of openingTags(s, "button")) {
        if (named(t.tag) || t.tag.endsWith("/>")) continue;
        const close = s.indexOf("</button>", t.end);
        const body = s.slice(t.end, close);
        if (body.includes("<button")) continue;
        // Strip icon components and whitespace; anything textual left means the button has a label.
        const text = body
          .replace(/<[A-Z]\w*[^>]*\/>/g, "")
          .replace(/<(svg|span|img)\b[^>]*\/>/g, "")
          .replace(/\{[^{}]*\}/g, "X");
        if (/[A-Za-z0-9]/.test(text)) continue;
        if (/<[A-Z]|<svg/.test(body)) bad.push(`${rel(f)}:${lineOf(s, t.start)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("IconButton requires a label at the type level", () => {
    const src = readFileSync(join(SRC, "ui", "Button.tsx"), "utf8");
    expect(src).toMatch(/label: string;\s*\n\s*icon: React\.ReactNode;/);
    expect(src).toMatch(/Omit<NativeButton, "aria-label" \| "children">/);
  });
});

describe("motion tokens", () => {
  const css = readFileSync(join(SRC, "styles", "motion.css"), "utf8");
  const DUR = ["instant", "fast", "base", "slow", "slower"];
  const ALL_DUR = [...DUR, "exit"];

  test("all tokens are defined", () => {
    for (const d of ALL_DUR) expect(css).toMatch(new RegExp(`--lens-dur-${d}:\\s*\\d+ms`));
    for (const e of ["out", "in-out", "exit", "drawer", "spring"]) expect(css).toContain(`--lens-ease-${e}:`);
    expect(css).toMatch(/--lens-press-scale:\s*0\.97;/);
    for (const t of ["press-in: 70ms", "press-release: 220ms", "press-release-heavy: 260ms", "press-hold-min: 90ms", "pending-delay: 300ms"]) expect(css).toContain(`--lens-${t};`);
  });

  test("durations follow the research scale (short is premium)", () => {
    const ms = DUR.map((d) => Number(css.match(new RegExp(`--lens-dur-${d}:\\s*(\\d+)ms`))![1]));
    expect(ms).toEqual([...ms].sort((a, b) => a - b));
    expect(ms[0]).toBeLessThanOrEqual(100);
    expect(ms[ms.length - 1]).toBeLessThanOrEqual(400);
  });

  test("reduced motion collapses every duration and scale, for both the OS setting and the Lens setting", () => {
    const blocks = [
      css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)")),
      css.slice(css.indexOf(':root[data-motion="reduce"] {')),
    ];
    for (const b of blocks) {
      const body = b.slice(0, b.indexOf("}") + 1);
      for (const d of ALL_DUR) expect(body).toMatch(new RegExp(`--lens-dur-${d}:\\s*1ms`));
      expect(body).toMatch(/--lens-press-scale:\s*1;/);
      expect(body).toMatch(/--lens-enter-scale:\s*1;/);
      // Presses collapse to depth-free fill steps: no travel, no scale, 1ms timings.
      for (const t of ["press-in", "press-release", "press-release-heavy"]) expect(body).toMatch(new RegExp(`--lens-${t}:\\s*1ms`));
      expect(body).toMatch(/--lens-press-scale-heavy:\s*1;/);
      expect(body).toMatch(/--lens-press-y-medium:\s*0px;/);
      expect(body).toMatch(/--lens-press-y-heavy:\s*0px;/);
      expect(body).not.toMatch(/--lens-press-fill/);
      expect(body).not.toMatch(/--lens-press-hold-min/);
    }
    expect(css).toContain(':root:not([data-motion="full"])');
  });

  test("motion and elevation are loaded everywhere tokens are", () => {
    const tokens = readFileSync(join(SRC, "styles", "tokens.css"), "utf8");
    expect(tokens.startsWith('@import "./motion.css";\n@import "./elevation.css";')).toBe(true);
  });

  test("migrated files stay on tokens (no raw 40–400ms durations or cubic-beziers in transitions)", () => {
    const list = readFileSync(join(ROOT, "tools", "polish", "migrated.txt"), "utf8").split(/\s+/).filter(Boolean);
    expect(list.length).toBeGreaterThanOrEqual(20);
    const bad: string[] = [];
    for (const f of list) {
      const s = readFileSync(join(ROOT, f), "utf8");
      const re = /\btransition(?:-duration|-timing-function)?\s*:([^;{}]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const v = m[1];
        if (/cubic-bezier\(/.test(v)) bad.push(`${f}:${lineOf(s, m.index)} cubic-bezier`);
        for (const d of v.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g)) {
          const ms = d[2] === "s" ? parseFloat(d[1]) * 1000 : parseFloat(d[1]);
          if (ms >= 40 && ms <= 400) bad.push(`${f}:${lineOf(s, m.index)} ${d[0]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("ratchets and bans", () => {
  test("inline style objects never grow per file", () => {
    const baseline = JSON.parse(readFileSync(join(ROOT, "tools", "polish", "inline-style-baseline.json"), "utf8")) as Record<string, number>;
    const grown: string[] = [];
    for (const f of TSX) {
      const n = (readFileSync(f, "utf8").match(/style=\{\{/g) || []).length;
      const allowed = baseline[rel(f)] ?? 0;
      // New files get none: use classes and tokens (src/ui) instead.
      if (n > allowed) grown.push(`${rel(f)}: ${n} > ${allowed}`);
    }
    expect(grown).toEqual([]);
  });

  test("no native title= tooltips on DOM elements", () => {
    const bad: string[] = [];
    for (const f of TSX) {
      const s = readFileSync(f, "utf8");
      for (const el of ["button", "div", "span", "a", "img", "input", "li", "label"]) {
        for (const t of openingTags(s, el)) {
          const m = t.tag.match(/\stitle=(\{[^}]*\}|"[^"]*")/);
          if (m && m[1] !== "{undefined}") bad.push(`${rel(f)}:${lineOf(s, t.start)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test("src/ui primitives use tokens only", () => {
    const dir = join(SRC, "ui");
    for (const f of readdirSync(dir)) {
      if (!/\.(tsx?|css)$/.test(f)) continue; // sub-folders (motion/) have their own tests
      const s = readFileSync(join(dir, f), "utf8");
      expect({ f, hex: s.match(/#[0-9a-fA-F]{3,8}\b/g) }).toEqual({ f, hex: null });
      if (f.endsWith(".css")) {
        const raw = [...s.matchAll(/\btransition\s*:([^;]*)/g)].filter((m) => /\d+ms/.test(m[1]));
        expect({ f, raw: raw.map((m) => m[0]) }).toEqual({ f, raw: [] });
      }
    }
    expect(existsSync(join(dir, "index.ts"))).toBe(true);
  });
});

describe("toast bus", () => {
  test("queues, de-duplicates the same message and dismisses", () => {
    const bus = createToastBus();
    const seen: number[] = [];
    const off = bus.subscribe((items) => seen.push(items.length));
    bus.show("Saved", { kind: "success" });
    const a = bus.show("Saved", { kind: "success" });
    expect(bus.items.length).toBe(1);
    bus.show("Couldn't reach Ollama", { kind: "error" });
    expect(bus.items.map((t) => t.kind)).toEqual(["success", "error"]);
    bus.dismiss(a);
    bus.dismiss(a);
    expect(bus.items.length).toBe(1);
    off();
    bus.clear();
    expect(seen[seen.length - 1]).toBe(1);
  });

  test("keeps at most five and errors stay longest", () => {
    const bus = createToastBus();
    for (let i = 0; i < 9; i++) bus.show(`t${i}`);
    expect(bus.items.map((t) => t.text)).toEqual(["t4", "t5", "t6", "t7", "t8"]);
    expect(TOAST_MS.error).toBeGreaterThan(TOAST_MS.info);
    expect(TOAST_MS.info).toBeGreaterThan(TOAST_MS.success);
  });
});
