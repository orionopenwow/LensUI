// Shelf → Notes preview (wave M0). Shows the note the Shelf would become, with Markdown and text
// copies. Saving to a file, PDF and "Send to contact" (through Messages, with approval) come in M4.
import React, { useMemo, useState } from "react";
import { exportNote, shelfToNote } from "./toNote";
import type { ShelfItem } from "./contract";

type Item = Pick<ShelfItem, "kind" | "title" | "text"> & { url?: string | null; path?: string | null; source_app?: string | null };

export const NotePreview: React.FC<{ items: Item[]; date?: Date }> = ({ items, date }) => {
  const note = useMemo(() => shelfToNote(items, { date }), [items, date]);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (format: "md" | "txt") => {
    const f = exportNote(note, format);
    void navigator.clipboard
      ?.writeText(f.contents)
      .then(() => setCopied(format === "md" ? "Markdown copied" : "Text copied"))
      .catch(() => setCopied("Couldn't copy"));
  };
  return (
    <section className="snp" aria-label="Note from the Shelf">
      <pre className="snp-body">{note.body}</pre>
      <div className="snp-actions">
        <button type="button" className="snp-btn" onClick={() => copy("md")}>
          Copy as Markdown
        </button>
        <button type="button" className="snp-btn" onClick={() => copy("txt")}>
          Copy as text
        </button>
        <button type="button" className="snp-btn" disabled aria-disabled="true">
          PDF (later update)
        </button>
        <span className="snp-status" role="status">
          {copied ?? ""}
        </span>
      </div>
    </section>
  );
};
