import { describe, expect, test } from "bun:test";
import { ATTACHMENTS, canSend, emptyRequest, openNote } from "../report/model";

describe("report a problem", () => {
  test("a new report attaches versions, log and crash, not settings or self-test", () => {
    const r = emptyRequest();
    expect(r.includeSystem && r.includeLog && r.includeCrash).toBe(true);
    expect(r.includeSettings || r.includeSelfTest).toBe(false);
  });

  test("every attachment has a toggle and plain words", () => {
    const keys = ATTACHMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of ATTACHMENTS) {
      expect(a.key in emptyRequest()).toBe(true);
      expect(a.label.length).toBeGreaterThan(3);
    }
  });

  test("needs a few words before it can be sent", () => {
    expect(canSend(emptyRequest())).toBe(false);
    expect(canSend({ ...emptyRequest(), whatHappened: "   " })).toBe(false);
    expect(canSend({ ...emptyRequest(), whatHappened: "Dock froze" })).toBe(true);
  });

  test("says what will happen when the report is long", () => {
    const base = { title: "t", text: "x", issueUrl: "https://github.com/orionopenwow/LensUI/issues/new?title=t" };
    expect(openNote({ ...base, needsPaste: true })).toContain("clipboard");
    expect(openNote({ ...base, needsPaste: false })).toContain("Nothing is sent");
    expect(openNote(null)).toBe("");
  });
});
