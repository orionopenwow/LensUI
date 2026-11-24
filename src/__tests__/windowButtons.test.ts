// Lens's own window buttons sit on the surface: the row that holds them has no fill of its own,
// so it can never show as a strip on a different-coloured title bar (docs/WINDOW_STYLING.md).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../styles/global.css"), "utf8");

function rules(selector: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  for (const m of css.matchAll(re)) out.push(m[2]);
  return out;
}

describe("window buttons", () => {
  test("the button row has no background or border of its own", () => {
    const row = rules(".traffic-lights");
    expect(row.length).toBeGreaterThan(0);
    for (const body of row) {
      expect(body).not.toMatch(/background|border|box-shadow|backdrop-filter/);
    }
  });
});
