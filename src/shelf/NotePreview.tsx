// Shelf → Notes sheet (docs/plans/MAGIC_WAVES.md §4, wave M4; shown only while
// magicWaves.shelfNotes is on). The Shelf becomes one note you can read before anything happens:
// - Save to Lens Notes (a text item in the Notes shelf, like any note made in Notes).
// - Export as Markdown, text or PDF into Downloads (local; never overwrites).
// - Send to a contact through Lens Messages: Matrix rooms only, the exact text is shown on an
//   approval card and nothing is sent until the person holds Send.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { exportNote, noteToText, shelfToNote, type NoteFormat } from "./toNote";
import { shelfAdd, shelfCreate, shelvesList, type ShelfItem } from "./contract";
import { NOTES_SHELF_NAME, NOTE_TAG } from "../coreapps/models/notes";
import { messagesApi } from "../messages/api";
import type { Conversation } from "../types/generated";
import "./NotePreview.css";
import { finishSend, sendableContacts, startSend, type SendState, type SendSteps } from "./NoteSheet.model";

type Item = Pick<ShelfItem, "kind" | "title" | "text"> & { url?: string | null; path?: string | null; source_app?: string | null };

const steps: SendSteps = {
  request: (conversation, text) => messagesApi.sendRequest(conversation, text),
  approve: (id) => messagesApi.approve(id),
  deny: (id) => messagesApi.deny(id),
  send: (id) => messagesApi.send(id),
};

async function notesShelfId(): Promise<string> {
  const found = (await shelvesList()).find((s) => s.name === NOTES_SHELF_NAME);
  return found ? found.id : (await shelfCreate(NOTES_SHELF_NAME)).id;
}

/** Hold-to-send: the button must stay pressed this long. */
const HOLD_MS = 700;

export const NotePreview: React.FC<{ items: Item[]; date?: Date; demo?: boolean }> = ({ items, date, demo }) => {
  const note = useMemo(() => shelfToNote(items, { date }), [items, date]);
  const [status, setStatus] = useState<string>("");
  const [contacts, setContacts] = useState<Conversation[] | null>(null);
  const [to, setTo] = useState<string>("");
  const [send, setSend] = useState<SendState>({ stage: "idle" });
  const hold = useRef<number | null>(null);

  useEffect(() => {
    if (demo) return;
    messagesApi
      .inbox()
      .then((l) => setContacts(sendableContacts(l)))
      .catch(() => setContacts([]));
  }, [demo]);

  const copy = (format: "md" | "txt") => {
    const f = exportNote(note, format);
    void navigator.clipboard
      ?.writeText(f.contents)
      .then(() => setStatus(format === "md" ? "Markdown copied" : "Text copied"))
      .catch(() => setStatus("Couldn't copy"));
  };

  const saveToNotes = async () => {
    if (demo) return setStatus("Preview only: turn on Shelf to Notes and use the Shelf.");
    try {
      await shelfAdd({ kind: "text", title: note.title, text: note.body, tags: [NOTE_TAG], source_app: "Shelf" } as any, await notesShelfId());
      setStatus("Saved to Lens Notes");
    } catch (e) {
      setStatus(`Couldn't save: ${String(e)}`);
    }
  };

  const exportTo = async (format: NoteFormat) => {
    if (demo) return setStatus("Preview only: nothing was saved.");
    const f = exportNote(note, format);
    const stem = f.name.replace(/\.[a-z]+$/, "");
    try {
      const path = await invoke<string>("save_note_export", {
        stem,
        ext: format,
        text: f.bytes ? null : f.contents,
        bytes: f.bytes ? Array.from(f.bytes) : null,
      });
      setStatus(`Saved ${path.split(/[\\/]/).pop()} in Downloads`);
    } catch (e) {
      setStatus(`Couldn't export: ${String(e)}`);
    }
  };

  const ask = async () => {
    if (!to || demo) return;
    setSend(await startSend(steps, to, noteToText(note.body)));
  };
  const decide = async (ok: boolean) => setSend(await finishSend(steps, send, ok));
  const holdStart = () => {
    if (hold.current !== null) return;
    hold.current = window.setTimeout(() => {
      hold.current = null;
      void decide(true);
    }, HOLD_MS);
  };
  const holdEnd = () => {
    if (hold.current !== null) window.clearTimeout(hold.current);
    hold.current = null;
  };

  const contactName = contacts?.find((c) => c.id === to)?.title ?? "";

  return (
    <section className="snp" aria-label="Note from the Shelf">
      <pre className="snp-body">{note.body}</pre>
      <div className="snp-actions">
        <button type="button" className="snp-btn snp-primary" onClick={saveToNotes}>
          Save to Notes
        </button>
        <button type="button" className="snp-btn" onClick={() => exportTo("md")}>
          Export .md
        </button>
        <button type="button" className="snp-btn" onClick={() => exportTo("txt")}>
          Export .txt
        </button>
        <button type="button" className="snp-btn" onClick={() => exportTo("pdf")}>
          Export PDF
        </button>
        <button type="button" className="snp-btn" onClick={() => copy("md")}>
          Copy
        </button>
      </div>

      <div className="snp-send">
        <label className="snp-label" htmlFor="snp-to">
          Send to a contact
        </label>
        {contacts && contacts.length === 0 ? (
          <p className="snp-note">Sending works with Matrix rooms you've connected in Settings › Notifications › Messages.</p>
        ) : (
          <div className="snp-row">
            <select id="snp-to" className="snp-select" value={to} onChange={(e) => setTo(e.target.value)} disabled={send.stage === "awaiting"}>
              <option value="">Choose a conversation…</option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button type="button" className="snp-btn" onClick={ask} disabled={!to || send.stage === "awaiting"}>
              Review message
            </button>
          </div>
        )}
        {send.stage === "awaiting" && (
          <div className="snp-approval" role="alertdialog" aria-label={`Send to ${contactName}?`}>
            <p className="snp-approval-head">This exact text goes to {contactName || "this conversation"}:</p>
            <pre className="snp-approval-text">{send.text}</pre>
            <div className="snp-row">
              <button
                type="button"
                className="snp-btn snp-primary"
                onPointerDown={holdStart}
                onPointerUp={holdEnd}
                onPointerLeave={holdEnd}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && holdStart()}
                onKeyUp={holdEnd}
              >
                Hold to send
              </button>
              <button type="button" className="snp-btn" onClick={() => decide(false)}>
                Don't send
              </button>
            </div>
          </div>
        )}
        <span className="snp-status" role="status">
          {send.stage === "sent" ? "Sent" : send.stage === "cancelled" ? "Not sent" : send.stage === "failed" ? `Couldn't send: ${send.error}` : status}
        </span>
      </div>
    </section>
  );
};
