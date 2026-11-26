// Reader view: the pure model behind src/browser/Pages.tsx ReaderPage.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clampReader, parseInline, parseReadable, READER_SIZE, readerWorthIt, readingLabel, safeHref, stepSize } from "../browser/reader";

const ARTICLE = [
  "# How tides work",
  "",
  "Tides are the rise and fall of sea levels caused by the Moon and the Sun.",
  "They come twice a day in most places. See [NOAA](https://oceanservice.noaa.gov/tides) for tables.",
  "",
  "## Spring and neap",
  "- Spring tides: Sun and Moon line up",
  "- Neap tides: they pull at right angles",
  "",
  "A last paragraph " + "word ".repeat(80),
].join("\n");

describe("reader view", () => {
  test("parses headings, paragraphs, lists and links from the page agent's text", () => {
    const d = parseReadable(ARTICLE, { title: "How tides work", url: "https://www.example.org/tides" });
    expect(d.title).toBe("How tides work");
    expect(d.host).toBe("example.org");
    // The page's H1 repeats the title, so it is not shown twice.
    expect(d.blocks.map((b) => b.kind)).toEqual(["para", "heading", "list", "para"]);
    const first = d.blocks[0];
    expect(first.kind === "para" && first.inline.some((i) => i.href === "https://oceanservice.noaa.gov/tides" && i.text === "NOAA")).toBe(true);
    // Lines of one paragraph are joined.
    expect(first.kind === "para" && first.inline[0].text.startsWith("Tides are the rise") && first.inline[0].text.includes("twice a day")).toBe(true);
    const list = d.blocks[2];
    expect(list.kind === "list" && list.items.length).toBe(2);
    expect(d.words).toBeGreaterThan(100);
    expect(readerWorthIt(d)).toBe(true);
    expect(readingLabel(d)).toMatch(/^1 min read · \d+ words$/);
  });

  test("only web links become links", () => {
    expect(safeHref("https://a.test/x?y=1#z")).toBe("https://a.test/x?y=1#z");
    expect(safeHref("http://a.test")).toBe("http://a.test/");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///c:/x", "//a.test", "https://a.test/\"onclick", "lens://settings", ""]) {
      expect(safeHref(bad)).toBeUndefined();
    }
    const parts = parseInline("Go [here](javascript:alert(1)) or [there](https://ok.test/a).");
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual(["https://ok.test/a"]);
    expect(parts.map((p) => p.text).join("")).toContain("here");
  });

  test("nothing in the text can become markup", () => {
    const d = parseReadable('<img src=x onerror=alert(1)>\n\n<script>bad()</script> text', { url: "https://a.test" });
    // Blocks hold plain strings; React escapes them. No block kind carries HTML.
    expect(JSON.stringify(d.blocks)).toContain("<img src=x onerror=alert(1)>");
    expect(d.blocks.every((b) => b.kind === "para")).toBe(true);
    const page = readFileSync(join(import.meta.dir, "..", "browser", "Pages.tsx"), "utf8");
    expect(page).not.toContain("dangerouslySetInnerHTML");
    // The reader loads nothing: no images, frames or media elements in the page component.
    const readerSrc = page.slice(page.indexOf("export function ReaderPage"));
    expect(readerSrc).not.toMatch(/<(img|iframe|video|audio|object|embed|link|script)\b/);
  });

  test("thin pages say so instead of pretending", () => {
    const thin = parseReadable("Sign in\n\nEmail", { title: "Login", url: "https://a.test" });
    expect(readerWorthIt(thin)).toBe(false);
    expect(parseReadable("", { url: "https://a.test/x" })).toMatchObject({ title: "a.test", words: 0, minutes: 0, blocks: [] });
    expect(readingLabel(parseReadable(""))).toBe("");
    expect(parseReadable("", {}).title).toBe("Reader");
    // A missing title falls back to the first heading.
    expect(parseReadable("## Notes\n\ntext", { url: "notaurl" }).title).toBe("Notes");
  });

  test("preferences are clamped", () => {
    expect(clampReader(null)).toEqual({ size: 18, width: "medium", face: "serif" });
    expect(clampReader({ size: 999, width: "huge" as never, face: "comic" as never })).toEqual({ size: READER_SIZE.max, width: "medium", face: "serif" });
    expect(clampReader({ size: 1, width: "wide", face: "sans" })).toEqual({ size: READER_SIZE.min, width: "wide", face: "sans" });
    let p = clampReader({ size: READER_SIZE.max - 2 });
    p = stepSize(p, 1);
    expect(p.size).toBe(READER_SIZE.max);
    expect(stepSize(p, 1).size).toBe(READER_SIZE.max);
    expect(stepSize(clampReader({ size: READER_SIZE.min }), -1).size).toBe(READER_SIZE.min);
  });

  test("very long pages are capped", () => {
    const d = parseReadable(Array.from({ length: 9000 }, (_, i) => `para ${i}\n`).join("\n"));
    expect(d.blocks.length).toBeLessThanOrEqual(4000);
  });

  test("the reader works with AI off and is reachable from the toolbar", () => {
    const surface = readFileSync(join(import.meta.dir, "..", "browser", "BrowserSurface.tsx"), "utf8");
    // The toolbar button no longer depends on the AI switch, and opens the local reader.
    expect(surface).toContain('aria-label={reader ? "Close reader view" : "Reader view"}');
    expect(surface).not.toContain("Show this page as a clean reader view in Markdown");
    // The page webview is hidden while the reader shows (it would draw over the frame).
    expect(surface).toMatch(/const overlay = .*!!reader/);
  });
});
