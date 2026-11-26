import { describe, expect, test } from "bun:test";
import { mdToLines, notePdf, wrap } from "../shelf/pdf";
import { exportNote, shelfToNote } from "../shelf/toNote";
import { sendableContacts } from "../shelf/NoteSheet.model";

const dec = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("Shelf → Notes PDF", () => {
  test("is a well-formed PDF with a cross-reference table that points at every object", () => {
    const pdf = dec(notePdf("# Title\n\n## A page\n_Page · from Edge_\n<https://example.com>\n\n> quoted text", "Title"));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const count = Number(/xref\n0 (\d+)\n/.exec(pdf)![1]);
    const offsets = [...pdf.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(offsets.length).toBe(count - 1);
    offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(pdf).toContain("(Title) Tj");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold");
  });

  test("stream lengths match their content", () => {
    const pdf = dec(notePdf("# T\nhello (world) \\ back"));
    for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      const end = pdf.indexOf("\nendstream", start);
      expect(end - start).toBe(Number(m[1]));
    }
    expect(pdf).toContain("(hello \\(world\\) \\\\ back) Tj");
  });

  test("long notes run onto more pages; long words are split", () => {
    const long = Array.from({ length: 200 }, (_, i) => `Line ${i} with some words in it`).join("\n");
    const pdf = dec(notePdf(long));
    expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBeGreaterThan(2);
    const parts = wrap({ text: "x".repeat(500), size: 11, indent: 0, bold: false });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.text.length <= 90)).toBe(true);
  });

  test("characters Helvetica can't show become ? instead of breaking the file", () => {
    const pdf = dec(notePdf("Emoji 🙂 and 漢字 and café — ok"));
    // The decoder reads Windows-1252, so byte 0x97 shows as an em dash again.
    expect(pdf).toContain("(Emoji ? and ?? and café — ok) Tj");
  });

  test("markdown styles map to sizes", () => {
    const l = mdToLines("# H\n## S\n> q\n_meta_");
    expect(l.map((x) => [x.size, x.bold, x.indent, x.text])).toEqual([
      [18, true, 0, "H"],
      [13.5, true, 0, "S"],
      [11, false, 14, "q"],
      [11, false, 0, "meta"],
    ]);
  });

  test("exportNote gives bytes for pdf and text for md/txt", () => {
    const n = shelfToNote([{ kind: "text", title: "A", text: "b" }], { title: "N" });
    expect(exportNote(n, "pdf").bytes?.length).toBeGreaterThan(200);
    expect(exportNote(n, "md").bytes).toBeUndefined();
  });
});

describe("Send to contact", () => {
  test("only Matrix conversations can be sent to (the one source Lens may write to)", () => {
    const c = (id: string, source: string, canReply: boolean) =>
      ({ id, source, app: "x", title: id, unread: 0, mentions: 0, lastPreview: null, lastTs: 0, url: "", vip: false, canReply }) as any;
    const list = sendableContacts([c("a", "matrix", true), c("b", "space:whatsapp", false), c("c", "matrix", false)]);
    expect(list.map((x) => x.id)).toEqual(["a"]);
  });
});

import { finishSend, messageText, startSend, type SendSteps } from "../shelf/NoteSheet.model";

describe("Send approval gating", () => {
  const make = () => {
    const calls: string[] = [];
    const steps: SendSteps = {
      request: async (c, t) => (calls.push(`request:${c}`), { approvalId: "ap1", text: t }),
      approve: async (id) => calls.push(`approve:${id}`),
      deny: async (id) => calls.push(`deny:${id}`),
      send: async (id) => calls.push(`send:${id}`),
    };
    return { calls, steps };
  };

  test("asking only registers the text; nothing is sent until approved", async () => {
    const { calls, steps } = make();
    const s = await startSend(steps, "!room", "hello");
    expect(s).toMatchObject({ stage: "awaiting", text: "hello" });
    expect(calls).toEqual(["request:!room"]);
  });

  test("approve then send, exactly once and in order", async () => {
    const { calls, steps } = make();
    const s = await finishSend(steps, await startSend(steps, "!room", "hi"), true);
    expect(s.stage).toBe("sent");
    expect(calls).toEqual(["request:!room", "approve:ap1", "send:ap1"]);
    const again = await finishSend(steps, s, true);
    expect(again.stage).toBe("sent");
    expect(calls.filter((c) => c.startsWith("send")).length).toBe(1);
  });

  test("declining denies and never sends", async () => {
    const { calls, steps } = make();
    const s = await finishSend(steps, await startSend(steps, "!room", "hi"), false);
    expect(s.stage).toBe("cancelled");
    expect(calls).toEqual(["request:!room", "deny:ap1"]);
  });

  test("finishing without an awaiting request does nothing", async () => {
    const { calls, steps } = make();
    expect((await finishSend(steps, { stage: "idle" }, true)).stage).toBe("idle");
    expect(calls).toEqual([]);
  });

  test("long notes are clipped for a message, short ones untouched", () => {
    expect(messageText("  hi  ")).toBe("hi");
    const long = messageText("x".repeat(9000));
    expect(long.length).toBeLessThanOrEqual(4000);
    expect(long).toContain("full note is in Lens Notes");
  });
});

describe("noteSource", () => {
  const { noteSource } = require("../shelf/NoteSheet.model") as typeof import("../shelf/NoteSheet.model");
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  test("ticked items when any are ticked", () => {
    expect(noteSource(items, new Set(["b"])).map((i) => i.id)).toEqual(["b"]);
  });
  test("the whole shelf otherwise", () => {
    expect(noteSource(items, new Set()).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
