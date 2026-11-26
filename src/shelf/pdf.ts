// A small, dependency-free PDF writer for Shelf → Notes exports (docs/plans/MAGIC_WAVES.md §4).
// Text only: A4 pages, Helvetica (built into every PDF reader, so nothing is embedded), headings
// a size up, quotes indented, long lines wrapped, as many pages as needed. Characters outside
// Windows-1252 become "?" (Helvetica's standard encoding can't show them); the Markdown and text
// exports keep everything. Local only.

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN = 56;
const BODY = 11;
const H1 = 18;
const H2 = 13.5;

/** Average Helvetica glyph width as a fraction of the font size; used to wrap without metrics. */
const AVG = 0.5;

export interface PdfLine {
  text: string;
  size: number;
  indent: number;
  bold: boolean;
}

/** Markdown (as Shelf notes write it) to styled lines, before wrapping. */
export function mdToLines(md: string): PdfLine[] {
  const out: PdfLine[] = [];
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^#\s+/.test(raw)) out.push({ text: raw.replace(/^#\s+/, ""), size: H1, indent: 0, bold: true });
    else if (/^#{2,6}\s+/.test(raw)) out.push({ text: raw.replace(/^#{2,6}\s+/, ""), size: H2, indent: 0, bold: true });
    else if (/^>\s?/.test(raw)) out.push({ text: raw.replace(/^>\s?/, ""), size: BODY, indent: 14, bold: false });
    else
      out.push({
        text: raw.replace(/^_(.*)_$/, "$1").replace(/^<(.*)>$/, "$1").replace(/`([^`]*)`/g, "$1"),
        size: BODY,
        indent: 0,
        bold: false,
      });
  }
  return out;
}

/** Wraps one line to the page width (word boundaries; very long words are split). */
export function wrap(line: PdfLine, width = PAGE_W - 2 * MARGIN): PdfLine[] {
  const max = Math.max(8, Math.floor((width - line.indent) / (line.size * AVG)));
  if (line.text.length <= max) return [line];
  const parts: PdfLine[] = [];
  let cur = "";
  for (const word of line.text.split(/(\s+)/)) {
    if ((cur + word).length <= max) {
      cur += word;
      continue;
    }
    if (cur.trim()) parts.push({ ...line, text: cur.trimEnd() });
    let w = word.trimStart();
    while (w.length > max) {
      parts.push({ ...line, text: w.slice(0, max) });
      w = w.slice(max);
    }
    cur = w;
  }
  if (cur.trim()) parts.push({ ...line, text: cur.trimEnd() });
  return parts.length ? parts : [{ ...line, text: "" }];
}

/** Windows-1252 code for a character, or "?" when it has none. */
function cp1252(ch: string): number {
  const c = ch.codePointAt(0) ?? 63;
  if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) return c;
  const map: Record<number, number> = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
    0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
    0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f, 0x00b7: 0xb7,
  };
  return map[c] ?? 63;
}

/** A PDF string literal's bytes: ( ) \ escaped, everything as Windows-1252. */
function pdfString(s: string): number[] {
  const out: number[] = [0x28];
  for (const ch of s) {
    const b = cp1252(ch);
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c);
    out.push(b);
  }
  out.push(0x29);
  return out;
}

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 0x7f);

/** Builds the PDF. Returns the file's bytes (starts with "%PDF-1.4"). */
export function notePdf(md: string, title = "Shelf notes"): Uint8Array {
  const lines = mdToLines(md).flatMap((l) => wrap(l));
  // Lay out into pages.
  const pages: { line: PdfLine; y: number }[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const lead = line.size * (line.size > BODY ? 1.6 : 1.4);
    if (y - lead < MARGIN) {
      pages.push([]);
      y = PAGE_H - MARGIN;
    }
    y -= lead;
    pages[pages.length - 1].push({ line, y });
  }

  const objects: number[][] = [];
  const add = (bytes: number[]): number => {
    objects.push(bytes);
    return objects.length; // object number
  };
  const catalogNo = add([]); // filled in below
  const pagesNo = add([]);
  const fontNo = add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  const boldNo = add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  const infoNo = add([...ascii("<< /Title "), ...pdfString(title), ...ascii(" /Producer (Lens) >>")]);
  const pageNos: number[] = [];
  for (const page of pages) {
    const content: number[] = [];
    for (const { line, y: ly } of page) {
      if (!line.text) continue;
      content.push(...ascii(`BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${(MARGIN + line.indent).toFixed(2)} ${ly.toFixed(2)} Td `));
      content.push(...pdfString(line.text), ...ascii(" Tj ET\n"));
    }
    const streamNo = add([...ascii(`<< /Length ${content.length} >>\nstream\n`), ...content, ...ascii("\nendstream")]);
    pageNos.push(
      add(
        ascii(
          `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
            `/Resources << /Font << /F1 ${fontNo} 0 R /F2 ${boldNo} 0 R >> >> /Contents ${streamNo} 0 R >>`,
        ),
      ),
    );
  }
  objects[catalogNo - 1] = ascii(`<< /Type /Catalog /Pages ${pagesNo} 0 R >>`);
  objects[pagesNo - 1] = ascii(`<< /Type /Pages /Kids [${pageNos.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNos.length} >>`);

  const out: number[] = ascii("%PDF-1.4\n");
  out.push(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a); // binary marker comment
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out.push(...ascii(`${i + 1} 0 obj\n`), ...body, ...ascii("\nendobj\n"));
  });
  const xref = out.length;
  out.push(...ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const o of offsets) out.push(...ascii(`${String(o).padStart(10, "0")} 00000 n \n`));
  out.push(...ascii(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Uint8Array.from(out);
}
