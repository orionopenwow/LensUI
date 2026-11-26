// Failures on things you asked for say so (B-18, browser share), and the permission bar says
// when a request timed out.
import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { failText, oops, quiet } from "../browser/oops";
import { lateFor, timedOutText } from "../browser/SitePermissions";
import { toastBus } from "../ui/toastBus";

const dir = join(import.meta.dir, "..", "browser");

describe("browser failures are shown", () => {
  beforeEach(() => toastBus.clear());

  test("failText keeps plain reasons and drops noise", () => {
    expect(failText("load history")).toBe("Couldn't load history.");
    expect(failText("go back", "That tab isn't open any more.")).toBe("Couldn't go back. That tab isn't open any more.");
    expect(failText("go back", new Error("The page took too long to respond"))).toBe("Couldn't go back. The page took too long to respond.");
    for (const noisy of ["TypeError: undefined is not a function", "invoke failed at core.rs:12 {\"code\":5}", "x".repeat(200), "C:\\Users\\me\\AppData\\x", "0x80004005", "lowercase internal message"]) {
      expect(failText("copy that", noisy)).toBe("Couldn't copy that.");
    }
  });

  test("oops puts the failure on the toast bus as an error; quiet does nothing", () => {
    oops("remove the bookmark")(new Error("boom"));
    const last = toastBus.items[toastBus.items.length - 1];
    expect(last.kind).toBe("error");
    expect(last.text).toBe("Couldn't remove the bookmark.");
    const n = toastBus.items.length;
    quiet();
    expect(toastBus.items.length).toBe(n);
  });

  test("no silent catch is left in the browser frame, and the frame shows the bus", () => {
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    const left = files.flatMap((f) => (readFileSync(join(dir, f), "utf8").match(/\.catch\(\(\) => (\{\}|undefined)\)/g) ?? []).map(() => f));
    expect(left).toEqual([]);
    // `quiet` is only for background work: never inside a click handler.
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text.match(/onClick=\{[^\n]*\.catch\(quiet\)/g) ?? []).toEqual(f === "BrowserSurface.tsx" ? [expect.stringContaining('glance("close")')] : []);
    }
    expect(readFileSync(join(dir, "BrowserSurface.tsx"), "utf8")).toContain("toastBus.subscribe");
  });

  test("a permission request nobody answered says so on its own tab", () => {
    const ask = { id: 4, tab: "t1", origin: "https://meet.example", kind: "camera" as const };
    expect(timedOutText(ask)).toBe("meet.example asked to use your camera. Nobody answered in time, so Lens blocked it. The site can ask again.");
    const late = [ask, { ...ask, id: 9, kind: "microphone" as const }, { ...ask, id: 7, tab: "t2" }];
    expect(lateFor(late, "t1")?.id).toBe(9);
    expect(lateFor(late, "t3")).toBeUndefined();
    expect(lateFor(late, undefined)).toBeUndefined();
    expect(lateFor([{ ...ask, kind: "midi" as never }], "t1")).toBeUndefined();
  });
});
