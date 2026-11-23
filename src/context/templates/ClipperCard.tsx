// Control Center card: clipper templates (Markdown with {{variables}}) and the folders Lens may
// save notes into, such as an Obsidian vault. A folder is approved once, after a clear question;
// Lens then only ever adds new .md files there.
import React, { useEffect, useMemo, useState } from "react";
import { FolderCheck, Plus, Trash2 } from "lucide-react";
import {
  BUILTIN_TEMPLATES, clipperFolderApprove, clipperFolderRevoke, clipperStateGet, clipperTemplatesSet, normaliseTemplates,
  renderClip, type ClipInput, type ClipTemplate,
} from "./templates";
import { VARIABLES } from "./parser";
import "../context.css";

export const SAMPLE: ClipInput = {
  title: "Designing Calm Technology",
  url: "https://calmtech.com/papers/designing-calm-technology",
  selection: "Technology should require the smallest possible amount of attention.",
  meta: { author: "Mark Weiser, John Seely Brown", published: "1995-12-21", site: "Calm Tech", keywords: ["design", "attention"] },
  now: new Date(2026, 10, 22, 18, 5),
};

interface Props {
  initial?: { folders: string[]; templates: ClipTemplate[]; selected?: string; pending?: { folder: string; message: string } };
}

export const ClipperCard: React.FC<Props> = ({ initial }) => {
  const [folders, setFolders] = useState<string[]>(initial?.folders ?? []);
  const [templates, setTemplates] = useState<ClipTemplate[]>(initial?.templates ?? BUILTIN_TEMPLATES);
  const [sel, setSel] = useState(initial?.selected ?? (initial?.templates ?? BUILTIN_TEMPLATES)[0].id);
  const [newFolder, setNewFolder] = useState("");
  const [pending, setPending] = useState<{ folder: string; message: string } | null>(initial?.pending ?? null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    clipperStateGet()
      .then((s) => {
        setFolders(s.folders ?? []);
        setTemplates(normaliseTemplates(s.templates));
      })
      .catch(() => {});
  }, [initial]);

  const t = templates.find((x) => x.id === sel) ?? templates[0];
  const preview = useMemo(() => renderClip(t, SAMPLE), [t]);

  const update = (patch: Partial<ClipTemplate>) => {
    const next = templates.map((x) => (x.id === t.id ? { ...x, ...patch, builtin: false } : x));
    setTemplates(next);
    if (!initial) clipperTemplatesSet(next).catch((e) => setNote(String(e)));
  };

  const ask = async () => {
    try {
      const r = await clipperFolderApprove(newFolder, false);
      if (r.approved) {
        setFolders((f) => [...new Set([...f, r.folder])]);
        setNote("Already approved.");
      } else setPending({ folder: r.folder, message: r.message });
    } catch (e) {
      setNote(String(e));
    }
  };

  return (
    <div className="cc-card rc-card">
      <div>
        <div className="cc-label">Clipper</div>
        <div className="cc-desc">
          Turn a page or selection into a Markdown note with a template, and save it straight into a folder you choose, such as your
          Obsidian vault. "Clip to notes" in the browser uses the first template.
        </div>
      </div>

      <div className="rc-places" role="tablist" aria-label="Templates">
        {templates.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === t.id} className={`cc-chip ${x.id === t.id ? "active" : ""}`} onClick={() => setSel(x.id)}>
            {x.name}
          </button>
        ))}
        <button type="button" className="cc-chip" onClick={() => {
          const id = `t${Date.now().toString(36)}`;
          const next = [...templates, { id, name: "New template", fileName: "{{title|safe_name}}", body: "# {{title}}\n{{url}}\n\n{{selection|blockquote}}\n" }];
          setTemplates(next);
          setSel(id);
        }}>
          <Plus size={12} /> New
        </button>
      </div>

      <div className="rc-split rc-clip">
        <div className="rc-custom">
          <label className="rc-field"><span>Name</span>
            <input className="cc-input" value={t.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className="rc-field"><span>File name</span>
            <input className="cc-input" value={t.fileName} onChange={(e) => update({ fileName: e.target.value })} />
          </label>
          <div className="rc-field-row">
            <label className="rc-field"><span>Save to</span>
              <select className="cc-input" value={t.folder ?? ""} onChange={(e) => update({ folder: e.target.value || undefined })}>
                <option value="">Copy to clipboard</option>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="rc-field"><span>Sub-folder</span>
              <input className="cc-input" value={t.subFolder ?? ""} placeholder="Clippings" onChange={(e) => update({ subFolder: e.target.value })} />
            </label>
          </div>
          <label className="rc-field"><span>Template</span>
            <textarea className="cc-input rc-prompt rc-mono" rows={9} value={t.body} onChange={(e) => update({ body: e.target.value })} spellCheck={false} />
          </label>
          <div className="rc-hint">
            Variables: {VARIABLES.map((v) => `{{${v}}}`).join(" ")}. Filters such as |date:"YYYY-MM-DD", |blockquote, |join:", ", |safe_name, |default:"…".
          </div>
          {preview.problems.length > 0 && <div className="rc-hint is-error">{preview.problems[0]}</div>}
          {!t.builtin && !BUILTIN_TEMPLATES.some((b) => b.id === t.id) && (
            <button type="button" className="cc-btn" onClick={() => {
              const next = templates.filter((x) => x.id !== t.id);
              setTemplates(next);
              setSel(next[0].id);
              if (!initial) clipperTemplatesSet(next).catch(() => {});
            }}>
              <Trash2 size={14} /> Delete template
            </button>
          )}
        </div>
        <div className="rc-preview" aria-label="Preview">
          <div className="rc-preview-head">Preview · {preview.fileName}.md</div>
          <pre className="rc-notepreview">{preview.body}</pre>
        </div>
      </div>

      <div>
        <div className="cc-label">Folders Lens may save notes into</div>
        <ul className="rc-list" aria-label="Approved folders">
          {folders.map((f) => (
            <li key={f} className="rc-row">
              <span className="rc-icon"><FolderCheck size={16} /></span>
              <span className="rc-name">{f}</span>
              <button type="button" className="rc-iconbtn" aria-label={`Stop saving into ${f}`}
                onClick={() => { setFolders(folders.filter((x) => x !== f)); if (!initial) clipperFolderRevoke(f).catch(() => {}); }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {!folders.length && <li className="rc-menu-empty">None yet. Clips are copied to the clipboard until you add a folder.</li>}
        </ul>
        <form className="rc-footer" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (newFolder.trim()) ask(); }}>
          <input className="cc-input" style={{ flex: 1 }} placeholder="C:\Users\you\Documents\Obsidian Vault" value={newFolder}
            aria-label="Folder path" onChange={(e) => setNewFolder(e.target.value)} />
          <button type="submit" className="cc-btn">Add folder</button>
        </form>
        {pending && (
          <div className="rc-confirm" role="alertdialog" aria-label="Approve folder">
            <div className="rc-confirm-text">{pending.message}</div>
            <div className="rc-actions">
              <button type="button" className="cc-btn" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="cc-btn cc-btn-primary" onClick={async () => {
                try {
                  const r = await clipperFolderApprove(pending.folder, true);
                  setFolders((f) => [...new Set([...f, r.folder])]);
                  setNewFolder("");
                  setNote(`Lens can now save notes into ${r.folder}.`);
                } catch (e) {
                  setNote(String(e));
                }
                setPending(null);
              }}>
                Allow
              </button>
            </div>
          </div>
        )}
        {note && <div className="rc-hint">{note}</div>}
      </div>
      <div className="cc-desc">Template syntax follows Obsidian Web Clipper (MIT). Lens never changes or deletes existing files.</div>
    </div>
  );
};
