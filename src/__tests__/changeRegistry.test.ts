// The change registry's tooling: the writer-coverage check (tools/changes/check.mjs) and the pure
// half of the Remove-all proof that runs on Windows CI (tests/e2e/remove-all.mjs).
import { describe, expect, test } from "bun:test";

// @ts-ignore plain JS tool
const { check, registered, stripComments, writersIn } = await import("../../tools/changes/check.mjs");
// @ts-ignore plain JS tool
const { changedRows, diffSnapshots, expandEnv, normalizeReg, parseWrite } = await import("../../tests/e2e/remove-all.mjs");

describe("writer coverage", () => {
  test("every OS writer in the tree is registered", () => {
    const r = check();
    expect(r.problems).toEqual([]);
    expect(Object.keys(r.calls).length).toBeGreaterThan(8);
  });

  test("finds registry, settings and hook writers, and ignores comments and readers", () => {
    expect(writersIn("let r = RegSetValueExW(k, n, 0, REG_SZ, Some(b));")).toEqual(["RegSetValueExW"]);
    expect(writersIn("SystemParametersInfoW(SPI_SETCURSORS, 0, None, f);")).toEqual(["SPI_SETCURSORS"]);
    expect(writersIn("SetWindowsHookExW(WH_MOUSE_LL, Some(p), None, 0)")).toEqual(["SetWindowsHookExW"]);
    expect(writersIn('Command::new("reg").args(["add", key, "/f"])')).toEqual(["reg.exe write"]);
    expect(writersIn('Command::new("reg").args(["query", key, "/s"])')).toEqual([]);
    expect(writersIn("// RegSetValueExW is never called here\nlet x = RegQueryValueExW(k);")).toEqual([]);
    expect(writersIn("SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, p, f)")).toEqual([]);
  });

  test("keeps a // that sits inside a string", () => {
    expect(stripComments('let u = "https://x"; // gone')).toBe('let u = "https://x"; ');
  });

  test("reads sources and exemptions from the registry text", () => {
    const r = registered(`
      pub const NOT_CHANGES: &[(&str, &str)] = &[
          ("a/reader.rs", "why"),
      ];
      Change { id: "x", sources: &["one.rs", "dir/two.rs"], undo: f },
      Change { id: "y", sources: &[
          "three.rs",
      ], undo: g },
    `);
    expect([...r.sources].sort()).toEqual(["dir/two.rs", "one.rs", "three.rs"]);
    expect([...r.exempt]).toEqual(["a/reader.rs"]);
  });
});

describe("Remove-all proof", () => {
  test("parses the three kinds of registry entry", () => {
    expect(parseWrite("HKCU\\Software\\Classes\\lens")).toEqual({ kind: "key", key: "HKCU\\Software\\Classes\\lens" });
    expect(parseWrite("HKCU\\Control Panel\\Keyboard::PrintScreenKeyForSnippingEnabled")).toEqual({
      kind: "value",
      key: "HKCU\\Control Panel\\Keyboard",
      value: "PrintScreenKeyForSnippingEnabled",
    });
    expect(parseWrite("%APPDATA%\\Claude\\x.json")).toEqual({ kind: "file", path: "%APPDATA%\\Claude\\x.json" });
  });

  test("expands environment variables whatever their case", () => {
    expect(expandEnv("%AppData%\\a\\%nope%", { APPDATA: "C:\\R" })).toBe("C:\\R\\a\\%nope%");
  });

  test("normalises reg output: order, blank lines and volatile values do not matter", () => {
    const a = normalizeReg("\r\nHKEY_CURRENT_USER\\X\r\n    B    REG_DWORD    0x1\r\n    A    REG_SZ    v\r\n    LastUpdated    REG_DWORD    0x5\r\n");
    const b = normalizeReg("HKEY_CURRENT_USER\\X\n    A    REG_SZ    v\n    LastUpdated    REG_DWORD    0x9\n    B    REG_DWORD    0x1\n");
    expect(a).toEqual(b);
  });

  test("reports leftovers per entry and names the rows that changed", () => {
    const manifest = [
      { id: "one", writes: ["k1", "k2"] },
      { id: "two", writes: ["k3"] },
    ];
    const before = { k1: ["a"], k2: ["<absent>"], k3: ["x"] };
    const after = { k1: ["a"], k2: ["HKEY\\k2", "v REG_SZ 1"], k3: ["x"] };
    expect(diffSnapshots(before, before)).toEqual([]);
    expect(diffSnapshots(before, after)).toEqual([{ entry: "k2", added: ["HKEY\\k2", "v REG_SZ 1"], missing: ["<absent>"] }]);
    expect(changedRows(manifest, before, after)).toEqual(["one"]);
  });
});
