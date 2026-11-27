// B-130: Dock search reopened during its close glide must come back visible and clickable.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSearchCloseGlide } from "../dock/searchClose";
import type { GlideHandle } from "../ui/motion";

/** A held exit like glideOut: on finish it commits its end pose inline; cancelled, it does not. */
function fakeExit() {
  const runs: { finish(): void; cancelled: boolean }[] = [];
  const exit = (el: Element | null | undefined): GlideHandle => {
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    const run = {
      cancelled: false,
      finish() {
        if (!run.cancelled) (el as unknown as { style: Style }).style.setProperty("opacity", "0");
        resolve();
      },
    };
    runs.push(run);
    return {
      finished,
      cancel() {
        if (run.cancelled) return;
        run.cancelled = true;
        resolve();
      },
    };
  };
  return { exit, runs };
}

class Style {
  props = new Map<string, string>();
  setProperty(k: string, v: string) {
    this.props.set(k, v);
  }
  removeProperty(k: string) {
    this.props.delete(k);
    return "";
  }
}
const drawer = () => ({ style: new Style() }) as unknown as Element & { style: Style };

describe("Dock search close glide (B-130)", () => {
  test("reopening mid-glide stops the exit, so the panel is never left at opacity 0", async () => {
    const { exit, runs } = fakeExit();
    const g = createSearchCloseGlide(exit);
    const d = drawer();
    const done = g.start(d);
    expect(g.running).toBe(true);
    expect(g.interrupt(d)).toBe(true);
    runs[0].finish(); // the engine would finish here; a cancelled exit commits nothing
    await done;
    expect(d.style.props.has("opacity")).toBe(false);
    expect(g.running).toBe(false);
  });

  test("a pose the exit already committed is cleared on reopen", async () => {
    const { exit, runs } = fakeExit();
    const g = createSearchCloseGlide(exit);
    const d = drawer();
    const done = g.start(d);
    runs[0].finish();
    await done;
    expect(d.style.props.get("opacity")).toBe("0");
    expect(g.interrupt(d)).toBe(false); // nothing running, but the panel is still put back
    expect(d.style.props.has("opacity")).toBe(false);
  });

  test("an open with no close in flight reports nothing to undo", () => {
    const g = createSearchCloseGlide(fakeExit().exit);
    expect(g.interrupt(null)).toBe(false);
  });

  test("DockSurface leaves the closing state when search opens during the glide", () => {
    const src = readFileSync(join(import.meta.dir, "../surfaces/DockSurface.tsx"), "utf8");
    const open = src.slice(src.indexOf("const openInDockLauncher = () => {"), src.indexOf("const closeInDockLauncher = () => {"));
    expect(open).toContain('if (searchCloseGlide.interrupt(pillRef.current?.querySelector(".dock-launcher-drawer"))) setDockSearchClosing(false);');
    expect(src).toContain("finishedOrGiveUp(searchCloseGlide.start(drawer), 400)");
    // A search that is gliding shut is not expanded.
    expect(src).toContain("aria-expanded={dockSearchOpen && !dockSearchClosing}");
  });

  test("the E2E scenario neither counts a closing search as open nor reopens one by toggling", () => {
    const run = readFileSync(join(import.meta.dir, "../../tests/e2e/run.mjs"), "utf8");
    const sc = run.slice(run.indexOf('id: "dock-search-dismiss"'), run.indexOf("// 2. A real click on the desktop"));
    expect(sc).toContain(".dock-search-slot.is-open:not(.is-closing) .dock-search-glide-input");
    expect(sc).toMatch(/if \(await isOpen\(\)\) await domClick\(dock\.locator\("\.dock-search-mag-btn"\)/);
  });
});
