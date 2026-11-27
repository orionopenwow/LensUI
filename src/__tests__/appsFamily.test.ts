// The Lens Apps family (core apps, Cleaner, Feeds, Messages and their Settings cards): failures
// say so (B-18 share), controls declare a press weight, "Remind me" turns a to-do into a Lens
// Timer reminder, and the Rust fixes B-124 / B-125 stay in place.
import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hhmm, reminderChoices, reminderLabel, reminderSet } from "../coreapps/models/reminders";
import { toastBus } from "../ui/toastBus";

const SRC = join(import.meta.dir, "..");
const ROOT = join(SRC, "..");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}
const FAMILY = ["apps", "coreapps", "cleaner", "feeds", "messages"].flatMap((d) => walk(join(SRC, d)));
const CARDS = ["AppsCard.tsx", "CleanerCard.tsx", "FeedsCard.tsx", "MessagesCard.tsx", "ControllerCard.tsx"].map((f) => join(SRC, "components", f));
const rel = (p: string) => p.slice(SRC.length + 1);

describe("B-18 share: nothing in the Lens Apps family fails silently", () => {
  beforeEach(() => toastBus.clear());

  test("no silent catch is left (51 sites at the start of this pass)", () => {
    const left = [...FAMILY, ...CARDS].flatMap((f) => (readFileSync(f, "utf8").match(/\.catch\(\(\) => (\{\}|undefined)\)/g) ?? []).map(() => rel(f)));
    expect(left).toEqual([]);
  });

  test("`quiet` is only for background work: never straight on a click", () => {
    const bad = [...FAMILY, ...CARDS].flatMap((f) => (readFileSync(f, "utf8").match(/onClick=\{[^\n]*\.catch\(quiet\)/g) ?? []).map((m) => `${rel(f)}: ${m.slice(0, 80)}`));
    expect(bad).toEqual([]);
  });

  test("every window in the family can show the toast bus", () => {
    expect(read("coreapps", "shell", "AppShell.tsx")).toContain("<ToastHost />");
    expect(read("apps", "AppsSurface.tsx")).toContain("<ToastHost />");
    // Stickies have no shell of their own.
    expect(read("coreapps", "apps", "Notes.tsx").match(/<ToastHost \/>/g)?.length).toBe(1);
  });

  test("Cleaner: a Stop that didn't reach the scan says the scan is still going", () => {
    const app = read("cleaner", "CleanerApp.tsx");
    expect(app.match(/api\.cancel\(\)\.catch\(stopFailed\)/g)?.length).toBe(4);
    expect(app).toContain("It finishes by itself; nothing is deleted.");
  });

  test("Messages: a failed reply stays readable; only a sent one clears itself", () => {
    const panel = read("messages", "MessagesPanel.tsx");
    expect(panel).toContain("const sentOk = !!pending?.result?.every((r) => r.ok);");
    expect(panel).toContain("return () => window.clearTimeout(t);");
    expect(panel).toContain('oops("prepare that reply")');
  });

  test("a sticky's tick that didn't save goes back and says so", () => {
    const notes = read("coreapps", "apps", "Notes.tsx");
    expect(notes).toMatch(/shelfUpdate\(note\.id, \{ text \}\)\.catch\(\(e\) => \{\s*setNote\(note\);\s*oops\("save that tick"\)\(e\);/);
  });
});

describe("feel: every button in the family declares a press weight", () => {
  test("buttons carry data-weight (the shell Button sets it from its variant)", () => {
    const bare = [...FAMILY, ...CARDS].flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return (text.match(/<button\b[^>]*>/gs) ?? []).filter((b) => !b.includes("data-weight")).map((b) => `${rel(f)}: ${b.slice(0, 70).replace(/\s+/g, " ")}`);
    });
    // ControllerCard's buttons are Settings-kit classes (cc-btn-*), weighted by class in src/ui/press.
    expect(bare.filter((b) => !b.startsWith("components/ControllerCard.tsx"))).toEqual([]);
    const ui = read("coreapps", "shell", "ui.tsx");
    expect(ui).toContain('data-weight={variant === "primary" || variant === "danger" ? "heavy" : "medium"}');
  });

  test("Cleaner moves on the global motion tokens", () => {
    const css = read("cleaner", "cleaner.css");
    expect(css).toContain("--cl-t-fast: var(--lens-dur-fast);");
    expect(css).toContain("--cl-t-base: var(--lens-dur-base);");
    expect(css).toContain("--cl-ease-in: var(--lens-ease-out);");
    expect(css).not.toMatch(/--cl-ease-[a-z]+: cubic-bezier/);
  });

  test("the core-app shell has no raw transition durations left", () => {
    const css = read("coreapps", "shell", "shell.css");
    const raw = [...css.matchAll(/\btransition\s*:([^;{}]*)/g)].flatMap((m) => m[1].match(/(?<![\w.(-])\d*\.?\d+m?s\b/g) ?? []);
    expect(raw).toEqual([]);
  });
});

describe("Notes: Remind me on a to-do", () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 26, h, m, 0);

  test("choices depend on the time of day and never offer a time that has gone", () => {
    expect(reminderChoices(at(10, 15)).map((c) => `${c.label} ${c.at}`)).toEqual(["In an hour 11:15", "This evening 18:00", "Tomorrow morning 09:00"]);
    // Evening is close or past: only the countdown and tomorrow.
    expect(reminderChoices(at(17, 45)).map((c) => c.id)).toEqual(["hour", "morning"]);
    expect(reminderChoices(at(22)).map((c) => c.label)).toEqual(["In an hour", "Tomorrow morning"]);
    // Before nine, "morning" is today, which is what a one-off 09:00 alarm does.
    expect(reminderChoices(at(6, 30)).find((c) => c.id === "morning")!.label).toBe("This morning");
    // Across midnight.
    expect(reminderChoices(at(23, 30))[0].at).toBe("00:30");
  });

  test("a countdown is a timer, a time of day is a one-off alarm", () => {
    const [hour, evening] = reminderChoices(at(10));
    expect(hour).toMatchObject({ kind: "timer", seconds: 3600 });
    expect(evening).toMatchObject({ kind: "alarm", hour: 18, minute: 0 });
  });

  test("labels drop the checkbox and markdown and stay short", () => {
    expect(reminderLabel("- [ ] Write the **release notes**")).toBe("Write the release notes");
    expect(reminderLabel("  * [ ] Tag `v0.3.0`")).toBe("Tag v0.3.0");
    expect(reminderLabel("- [ ] ")).toBe("To-do");
    expect(reminderLabel(`- [ ] ${"x".repeat(100)}`).length).toBe(60);
    expect(reminderSet(reminderChoices(at(10))[1], "Call back")).toBe("Lens Timer will remind you at 18:00: Call back");
    expect(hhmm(at(7, 5))).toBe("07:05");
  });

  test("the Notes window wires it to Lens Timer's own commands, and stickies have a visible way back", () => {
    const notes = read("coreapps", "apps", "Notes.tsx");
    expect(notes).toContain('invoke("coreapp_timer_add", { label, seconds: choice.seconds, duration: null })');
    expect(notes).toContain('invoke("coreapp_alarm_add", { label, hour: choice.hour, minute: choice.minute, weekdays: 0, tzOffsetMin: tzOffsetMin() })');
    expect(notes).toContain("Make stickies clickable");
  });
});

describe("Rust fixes stay in place (compiled and tested by CI)", () => {
  const timers = readFileSync(join(ROOT, "src-tauri", "src", "coreapps", "timers.rs"), "utf8");
  const cmds = readFileSync(join(ROOT, "src-tauri", "src", "commands", "coreapps.rs"), "utf8");

  test("B-124: the timer thread keeps alarms on local time", () => {
    expect(timers).toContain("pub fn retime_alarms(&mut self, tz_offset_min: i32, now: i64) -> bool");
    expect(cmds).toContain("coreapps::local_offset_min().is_some_and(|tz| st.store.retime_alarms(tz, now))");
    expect(timers).toContain("fn alarms_follow_the_clock_change()");
    expect(timers).toContain("fn a_ring_after_sleep_says_it_is_late_and_rings_once()");
  });

  test("B-125: an alarm that is only waiting neither ticks every second nor broadcasts", () => {
    expect(timers).toContain("pub fn counting(&self) -> bool");
    expect(cmds).toContain("if counting || was_counting || !fired.is_empty() || retimed {");
    expect(cmds).toContain("st.store.sleep_ms(now, 5000)");
    expect(cmds).not.toContain("if active { 1000 } else { 5000 }");
  });
});
