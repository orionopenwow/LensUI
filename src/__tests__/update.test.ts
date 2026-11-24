import { describe, expect, test } from "bun:test";
import { IDLE, applyStatus, mayReplace, notesLines, viewOf, type UpdateStatus } from "../update/model";

const st = (state: string, newVersion: string | null = "0.3.1"): UpdateStatus => ({
  state,
  currentVersion: "0.3.0",
  newVersion,
  notes: null,
  message: "",
});

describe("update state", () => {
  test("follows check → download → ready → installing", () => {
    let s = IDLE;
    for (const next of ["available", "downloading", "ready", "installing"]) {
      s = applyStatus(s, st(next));
      expect(s.state).toBe(next);
    }
  });

  test("a ready update is never hidden by a later check", () => {
    const ready = st("ready");
    expect(applyStatus(ready, st("up-to-date", null)).state).toBe("ready");
    expect(applyStatus(ready, st("available")).state).toBe("ready");
    expect(applyStatus(ready, st("not-configured", null)).state).toBe("ready");
    expect(applyStatus(ready, st("error")).state).toBe("error");
    expect(applyStatus(ready, st("ready", "0.3.2")).newVersion).toBe("0.3.2");
  });

  test("installing only gives way to an error", () => {
    expect(mayReplace("installing", "ready")).toBe(false);
    expect(mayReplace("installing", "error")).toBe(true);
    expect(mayReplace("error", "available")).toBe(true);
  });

  test("the pill appears only when there is something to do", () => {
    expect(viewOf(IDLE).pill).toBeNull();
    expect(viewOf(st("up-to-date", null)).pill).toBeNull();
    expect(viewOf(st("not-configured", null)).pill).toBeNull();
    expect(viewOf(st("error")).pill).toBeNull();
    expect(viewOf(st("ready"))).toEqual({ pill: "Restart to update", action: "restart", busy: false });
    expect(viewOf(st("available")).action).toBe("open");
    expect(viewOf(st("downloading")).busy).toBe(true);
    expect(viewOf(st("installing")).action).toBe("none");
  });

  test("release notes become short lines", () => {
    expect(notesLines(null)).toEqual([]);
    expect(notesLines("## Added\n- **Lens Browser** permissions\n\n\n- Faster dock")).toEqual(["Added", "- Lens Browser permissions", "", "- Faster dock"]);
    expect(notesLines("a\n".repeat(100), 5)).toHaveLength(5);
  });
});
