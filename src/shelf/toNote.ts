// Shelf → Notes (docs/plans/MAGIC_WAVES.md §4). A pure function that turns Shelf items into a
// note, and plain-text exports. Local only: nothing here reads the network or the screen.
import type { ShelfItem } from "./contract";

export type NoteFormat = "md" | "txt" | "pdf";

export interface NoteDraft {
  title: string;
  /** Markdown body. */
  body: string;
  /** How many Shelf items went in. */
  count: number;
}

type ItemLike = Pick<ShelfItem, "kind" | "title" | "text"> & { url?: string | null; path?: string | null; source_app?: string | null };

const KIND_LABEL: Record<string, string> = {
  text: "Text",
  page: "Page",
  selection: "Selection",
  file: "File",
  image: "Image",
  transcript: "Transcript",
  answer: "Answer",
};

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Builds a Markdown note from Shelf items, newest first as given. */
export function shelfToNote(items: ItemLike[], opts: { title?: string; date?: Date; maxTextChars?: number } = {}): NoteDraft {
  const date = opts.date ?? new Date();
  const maxText = opts.maxTextChars ?? 1200;
  const title = opts.title?.trim() || `Shelf notes · ${date.toISOString().slice(0, 10)}`;
  const parts: string[] = [`# ${title}`, ""];
  if (items.length === 0) parts.push("_The Shelf is empty._");
  for (const it of items) {
    const label = KIND_LABEL[it.kind] ?? "Item";
    const heading = oneLine(it.title || it.url || it.path || label);
    parts.push(`## ${clip(heading, 120)}`);
    const meta: string[] = [label];
    if (it.source_app) meta.push(`from ${it.source_app}`);
    parts.push(`_${meta.join(" · ")}_`);
    if (it.url) parts.push(`<${it.url}>`);
    else if (it.path) parts.push(`\`${it.path}\``);
    const text = (it.text ?? "").trim();
    if (text) {
      parts.push("");
      parts.push(
        clip(text, maxText)
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n"),
      );
    }
    parts.push("");
  }
  return { title, body: parts.join("\n").trimEnd() + "\n", count: items.length };
}

/** Markdown to plain text: headings, emphasis, quotes and link brackets removed. */
export function noteToText(md: string): string {
  return md
    .split("\n")
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "  ")
        .replace(/^_(.*)_$/, "$1")
        .replace(/^<(.*)>$/, "$1")
        .replace(/`([^`]*)`/g, "$1"),
    )
    .join("\n");
}

export interface ExportFile {
  name: string;
  mime: string;
  contents: string;
}

/** A safe file name from a note title. */
export function fileNameFor(title: string, format: Exclude<NoteFormat, "pdf">): string {
  const base = oneLine(title).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80).trim() || "Note";
  return `${base}.${format}`;
}

/** Export as Markdown or plain text. PDF is a later wave (throws so callers show "coming soon"). */
export function exportNote(note: NoteDraft, format: NoteFormat): ExportFile {
  if (format === "pdf") throw new Error("PDF export comes in a later update");
  if (format === "md") return { name: fileNameFor(note.title, "md"), mime: "text/markdown", contents: note.body };
  return { name: fileNameFor(note.title, "txt"), mime: "text/plain", contents: noteToText(note.body) };
}
