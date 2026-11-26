import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeInfo, FailsafeReport } from "../types/generated";
import { FALLBACK_FACTS, SAFETY_LINKS, changeGroups, changesLine, neverTouchedLine, removeAllPreview, safeModeLine, signInLine } from "../safety/model";
import { PAGES } from "../settings/registry";

const root = join(import.meta.dir, "../..");
const rust = (p: string) => readFileSync(join(root, "src-tauri/src", p), "utf8");

const manifest: ChangeInfo[] = [
  { id: "taskbar", label: "Windows taskbar", scope: "persistent", writes: ["HKCU\\Software\\X::Y"] },
  { id: "accent", label: "Windows accent colour", scope: "persistent", writes: [] },
  { id: "hooks", label: "Keyboard and mouse hooks", scope: "session", writes: [] },
  { id: "wallpapers", label: "Wallpaper Switcher", scope: "lensData", writes: [] },
];

const report = (over: Partial<FailsafeReport["status"]> = {}, off: string[] = []): FailsafeReport =>
  ({
    status: { safeMode: false, safeReason: "", tripped: [], killed: [], configRepairs: [], caughtPanics: [], ...over },
    surfaces: [],
    switches: [
      { id: "hotCorners", label: "Hot corners", off: off.includes("hotCorners") },
      { id: "tiling", label: "Tiling", off: off.includes("tiling") },
    ],
  }) as unknown as FailsafeReport;

describe("Safety card", () => {
  test("groups the change registry into what stays, what ends with Lens and what never leaves its folder", () => {
    const groups = changeGroups(manifest);
    expect(groups.map((g) => [g.id, g.labels.length])).toEqual([
      ["persistent", 2],
      ["session", 1],
      ["lensData", 1],
    ]);
    expect(groups[0].labels).toEqual(["Windows taskbar", "Windows accent colour"]);
    expect(changesLine(manifest)).toBe("4 kinds of change, each with its own undo.");
    expect(changesLine(manifest.slice(0, 1))).toBe("1 kind of change, each with its own undo.");
    // An unreadable registry is said plainly, never shown as "0 changes".
    expect(changeGroups([])).toEqual([]);
    expect(changesLine([])).toContain("couldn't be read");
  });

  test("says what is never touched, with the real count when the backend gives one", () => {
    expect(neverTouchedLine({ ...FALLBACK_FACTS, protectedApps: 42 })).toBe(
      "42 anti-cheat services and protected games, fullscreen apps, and Windows' machine-wide settings (HKLM).",
    );
    expect(neverTouchedLine(FALLBACK_FACTS).startsWith("Anti-cheat services")).toBe(true);
  });

  test("Safe Mode reads on, off, and off with paused or held-off features", () => {
    expect(safeModeLine(null).on).toBe(false);
    expect(safeModeLine(report())).toEqual({ on: false, text: expect.stringContaining("Two failed starts") });
    const on = safeModeLine(report({ safeMode: true, safeReason: "Lens did not finish starting twice." }));
    expect(on.on).toBe(true);
    expect(on.text).toContain("your settings are unchanged");
    expect(on.text).toContain("did not finish starting twice");
    const busy = safeModeLine(report({ tripped: [{ feature: "volume", label: "Volume", error: "timed out" }] as never }, ["hotCorners"]));
    expect(busy.text).toContain("1 paused after repeated failures and 1 held off by features.json");
  });

  test("the sign-in line names Shift and the real wait", () => {
    expect(signInLine(FALLBACK_FACTS)).toContain("Hold Shift while you sign in");
    expect(signInLine(FALLBACK_FACTS)).toContain("up to 2 minutes");
    expect(signInLine({ ...FALLBACK_FACTS, signinMaxWaitSecs: 60 })).toContain("up to 1 minute)");
  });

  test("the card's fixed facts match the code that enforces them", () => {
    // Keys: the fallback list is the Rust list, name for name.
    const input = rust("input.rs");
    const block = input.slice(input.indexOf("pub const PROTECTED_KEYS"), input.indexOf("];", input.indexOf("pub const PROTECTED_KEYS")));
    const names = [...block.matchAll(/\("([^"]+)",/g)].map((m) => m[1]);
    expect(names).toEqual(FALLBACK_FACTS.protectedKeys);
    // Sign-in: the wait and the Shift skip.
    const gate = rust("app/signin_gate.rs");
    expect(gate).toContain(`MAX_WAIT_MS: u64 = ${FALLBACK_FACTS.signinMaxWaitSecs}_000`);
    expect(gate).toContain("if o.shift {\n        return Decision::Skip;");
    // The command reads the same sources.
    const cmd = rust("commands/failsafe.rs");
    expect(cmd).toContain("crate::input::PROTECTED_KEYS");
    expect(cmd).toContain("crate::win_rules::ANTI_CHEAT_FRAGMENTS.len()");
    expect(cmd).toContain("crate::app::signin_gate::MAX_WAIT_MS");
    // Lens never writes HKLM (the registry's own rule), so the card may say so.
    expect(rust("changes.rs")).toContain("Lens never writes HKLM");
  });

  test("Remove all shows what it will undo before the confirm word, from the same registry", () => {
    expect(removeAllPreview([])).toBeNull();
    const p = removeAllPreview(manifest);
    expect(p?.line).toBe("Remove all will check and undo 4 kinds of change, and report each one.");
    expect(p?.labels).toEqual(manifest.map((c) => c.label));
    expect(p?.keeps).toContain("your files");
    const card = readFileSync(join(root, "src/components/BackupRestoreCard.tsx"), "utf8");
    expect(card).toContain('"changes_manifest_cmd"');
    // The preview is rendered inside the confirmation, above the confirm word.
    expect(card.indexOf("data-remove-all-preview")).toBeGreaterThan(card.indexOf("{confirming && ("));
    expect(card.indexOf("data-remove-all-preview")).toBeLessThan(card.indexOf("Type ${CONFIRM_WORD} to confirm"));
  });

  test("its buttons go to sections that exist in Settings › About & Testing", () => {
    const about = PAGES.find((p) => p.id === "about");
    expect(about).toBeDefined();
    const sections = (about?.sections ?? []).map((s) => s.id);
    for (const link of Object.values(SAFETY_LINKS)) {
      const [page, section] = link.split("#");
      expect(page).toBe("about");
      expect(sections).toContain(section);
    }
    const page = readFileSync(join(root, "src/settings/pages/AboutPage.tsx"), "utf8");
    expect(page).toContain("<SafetyCard />");
  });
});
