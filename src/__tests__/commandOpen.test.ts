import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isNewOpen, pendingOpen } from "../command/openSeq";

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
    const deps = block.slice(block.indexOf("subs.forEach((p) => p.then((u) => u())"));
    expect(deps.slice(0, 120)).toMatch(/\}, \[\]\);/);
  });

  test("the backend stamps every open with a seq that its replay reuses", () => {
    const rs = readFileSync(join(import.meta.dir, "..", "..", "src-tauri", "src", "app", "integration.rs"), "utf8");
    const fn = rs.slice(rs.indexOf("pub(crate) fn show_command("), rs.indexOf("fn command_visible("));
    // The link stamps the seq; the replay is built from the stamped payload.
    expect(fn).toMatch(/link\.opened\(payload\)/);
    expect(fn.indexOf("link.opened(payload)")).toBeLessThan(fn.indexOf("let retry_payload = opened.payload.clone()"));
    // An open the page already applied is not sent again.
    expect(fn).toMatch(/if opened\.send \{/);
  });
});

describe("Command ready handshake (B-12)", () => {
  const src = readFileSync(join(import.meta.dir, "..", "command", "CommandSurface.tsx"), "utf8");

  test("only a real open counts as pending", () => {
    expect(pendingOpen({ seq: 3, text: "dark mode" })).toBe(true);
    expect(pendingOpen(null)).toBe(false);
    expect(pendingOpen(undefined)).toBe(false);
    expect(pendingOpen({})).toBe(false);
    expect(pendingOpen({ seq: Number.NaN })).toBe(false);
    // A mocked backend may answer with anything.
    expect(pendingOpen("ok" as unknown as { seq?: number })).toBe(false);
  });

  test("the page asks for its pending open only after its listeners are registered", () => {
    const ask = src.indexOf('invoke<OpenPayload>("command_ready_cmd")');
    expect(ask).toBeGreaterThan(0);
    const before = src.slice(src.lastIndexOf("Promise.all(subs)", ask), ask);
    expect(before).toMatch(/Promise\.all\(subs\)\s*\.then\(\(\) => $/);
  });

  test("an applied open is confirmed to the backend, and an early Enter is queued, not dropped", () => {
    expect(src).toMatch(/invoke\("command_open_applied_cmd", \{ seq: appliedSeq \}\)/);
    const enter = src.slice(src.indexOf('if (e.key === "Enter" && !(e.shiftKey && mode === "ask"))'));
    expect(enter.slice(0, 700)).toMatch(/if \(!linkedRef\.current\) \{[\s\S]*queuedEnter\.current = /);
    expect(src).toMatch(/if \(queued\) runActiveRef\.current\(queued\.shift, queued\.ctrl\)/);
  });

  test("one Enter, no retry (B-12b): the backend gives the page the keyboard when Command opens", () => {
    const e2e = readFileSync(join(import.meta.dir, "..", "..", "tests", "e2e", "run.mjs"), "utf8");
    // One Enter decides the result; the second press only runs after a failure, to diagnose it.
    const firstPress = e2e.indexOf('await box.press("Enter")');
    const answeredAt = e2e.indexOf("const ok = await answered()");
    expect(firstPress).toBeGreaterThan(0);
    expect(e2e.slice(firstPress + 10, answeredAt)).not.toMatch(/box\.press/);
    expect(e2e).toMatch(/commandKeysReady/);
    expect(e2e).toMatch(/enterSeen/);
    const rust = (f: string) => readFileSync(join(import.meta.dir, "..", "..", "src-tauri", "src", ...f.split("/")), "utf8");
    expect(rust("app/integration.rs")).toMatch(/fn show_command[\s\S]*?focus_page\(&win\)/);
    expect(rust("commands/command_ui.rs")).toMatch(/fn command_open_applied_cmd[\s\S]*?focus_page/);
    expect(rust("app/renderer.rs")).toMatch(/MoveFocus\(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC\)/);
    expect(src).toMatch(/bump\("commandEnter"\)/);
    expect(src).toMatch(/bump\("commandRun"\)/);
  });
});
