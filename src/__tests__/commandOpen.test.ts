import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isNewOpen } from "../command/openSeq";

describe("Command open replay (cold-start race)", () => {
  test("a replay of an applied open is ignored, a new open is applied", () => {
    expect(isNewOpen(null, 1)).toBe(true);
    expect(isNewOpen(1, 1)).toBe(false); // the backend's replay after the window became ready
    expect(isNewOpen(1, 2)).toBe(true);
    expect(isNewOpen(5, 3)).toBe(false); // a stale replay arriving late
  });

  test("the open listener is registered once for the window's life", () => {
    const src = readFileSync(join(import.meta.dir, "..", "command", "CommandSurface.tsx"), "utf8");
    const block = src.slice(src.indexOf('listen<OpenPayload>("lens://command/open"'));
    const deps = block.slice(block.indexOf("return () => subs.forEach"));
    expect(deps.slice(0, 120)).toMatch(/\}, \[\]\);/);
  });

  test("the backend stamps every open with a seq that its replay reuses", () => {
    const rs = readFileSync(join(import.meta.dir, "..", "..", "src-tauri", "src", "app", "integration.rs"), "utf8");
    const fn = rs.slice(rs.indexOf("pub(crate) fn show_command("));
    expect(fn).toMatch(/OPEN_SEQ/);
    // The seq is inserted before the payload is cloned for the replay.
    expect(fn.indexOf('"seq"')).toBeLessThan(fn.indexOf("let retry_payload = payload.clone()"));
  });
});
