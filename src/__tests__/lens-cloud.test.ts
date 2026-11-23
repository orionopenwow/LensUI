import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const css = readFileSync(join(root, "src/styles/lens-cloud.css"), "utf8").trim();

describe("lens-cloud orb", () => {
  test("the website carries an exact copy of the shared cloud CSS", () => {
    const site = readFileSync(join(root, "docs/site/css/site.css"), "utf8");
    const m = site.match(/\/\* LENS-CLOUD:BEGIN[^*]*\*\/\n([\s\S]*?)\n\/\* LENS-CLOUD:END \*\//);
    expect(m).not.toBeNull();
    expect(m![1].trim()).toBe(css);
  });
  test("no orb spins any more", () => {
    for (const f of ["docs/site/css/site.css", "src/presence/presence.css", "src/styles/lens-cloud.css"]) {
      expect(readFileSync(join(root, f), "utf8")).not.toMatch(/orb-spin|rotate:\s*360deg/);
    }
  });
  test("the cloud only animates transform, opacity and filter, and stills for reduced motion", () => {
    const frames = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}/g)].map((m) => m[1]);
    for (const f of frames) for (const prop of f.matchAll(/([a-z-]+):/g)) expect(["transform", "border-radius", "filter"]).toContain(prop[1]);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.lens-cloud, \.lens-cloud i \{ animation: none/);
  });
});
