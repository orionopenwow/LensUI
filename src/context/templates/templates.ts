// Clipper templates: what a clip looks like as a Markdown note, and where it goes.
// Rendering: ./parser.ts. Writing: Rust `clipper_write`, into folders the user approved.
import { invoke } from "@tauri-apps/api/core";
import { lint, render, type Vars } from "./parser";

export interface ClipTemplate {
  id: string;
  name: string;
  /** File name template, e.g. `{{title|safe_name}}`. */
  fileName: string;
  /** Note body template (may start with YAML front matter). */
  body: string;
  /** Approved folder to save into; empty = copy to clipboard only. */
  folder?: string;
  /** Optional sub-folder inside it, e.g. "Clippings". */
  subFolder?: string;
  builtin?: boolean;
}

export interface ClipInput {
  title?: string;
  url?: string;
  selection?: string;
  pageText?: string;
  highlights?: string[];
  tags?: string[];
  meta?: { author?: string; description?: string; published?: string; site?: string; keywords?: string[] };
  now?: Date;
}

export const BUILTIN_TEMPLATES: ClipTemplate[] = [
  {
    id: "note",
    name: "Note with source",
    fileName: "{{title|safe_name|truncate:80}}",
    subFolder: "Clippings",
    body: `---
title: {{title|yaml_string}}
source: {{url}}
author: {{author|default:""|yaml_string}}
published: {{published|date:"YYYY-MM-DD"}}
created: {{date|date:"YYYY-MM-DD"}}
tags:{{tags|yaml_list}}
---
{{selection|blockquote}}

{{content}}
`,
    builtin: true,
  },
  {
    id: "highlights",
    name: "Highlights only",
    fileName: "{{date|date:\"YYYY-MM-DD\"}} {{title|safe_name|truncate:60}}",
    subFolder: "Clippings",
    body: `# {{title}}
{{url|link:"Source"}} · {{date|date:"D MMMM YYYY"}}

{{highlights|blockquote}}
{{selection|blockquote}}
`,
    builtin: true,
  },
  {
    id: "reading-list",
    name: "Reading list line",
    fileName: "Reading list",
    body: `- [ ] [{{title}}]({{url}}) · {{domain}} · added {{date|date:"YYYY-MM-DD"}}
`,
    builtin: true,
  },
];

export function domainOf(url?: string): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** The variables a template sees (see VARIABLES in parser.ts). */
export function clipVars(c: ClipInput): Vars {
  const now = c.now ?? new Date();
  const tags = [...new Set([...(c.tags ?? []), ...(c.meta?.keywords ?? [])].map((t) => t.trim()).filter(Boolean))];
  return {
    title: c.title?.trim() || domainOf(c.url) || "Untitled",
    url: c.url ?? "",
    domain: domainOf(c.url),
    author: c.meta?.author ?? "",
    description: c.meta?.description ?? "",
    published: c.meta?.published ?? "",
    site: c.meta?.site ?? domainOf(c.url),
    date: now,
    time: now,
    selection: c.selection?.trim() || undefined,
    highlights: c.highlights ?? [],
    content: c.selection ? "" : c.pageText ?? "",
    tags: tags.length ? tags : ["clipping"],
    keywords: c.meta?.keywords ?? [],
  };
}

export interface RenderedClip {
  fileName: string;
  body: string;
  problems: string[];
}

export function renderClip(t: ClipTemplate, c: ClipInput): RenderedClip {
  const vars = clipVars(c);
  // Collapse runs of blank lines left by empty variables.
  const body = render(t.body, vars).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const fileName = render(t.fileName, vars).trim() || "Untitled";
  return { fileName, body, problems: [...lint(t.body), ...lint(t.fileName)] };
}

/** What to do with a clip: write to an approved folder, or ask first / copy when there is none. */
export function planClip(t: ClipTemplate, approved: string[]): { mode: "write" | "approve" | "copy"; folder?: string } {
  const f = t.folder?.trim();
  if (!f) return { mode: "copy" };
  const norm = (p: string) => p.trim().replace(/[\\/]+$/, "").toLowerCase();
  return approved.some((a) => norm(a) === norm(f)) ? { mode: "write", folder: f } : { mode: "approve", folder: f };
}

export function normaliseTemplates(raw: unknown): ClipTemplate[] {
  const user = Array.isArray(raw)
    ? raw
        .filter((t): t is ClipTemplate => !!t && typeof t === "object" && typeof (t as any).id === "string" && typeof (t as any).body === "string")
        .map((t) => ({ ...t, name: String(t.name || t.id).slice(0, 60), fileName: String(t.fileName || "{{title|safe_name}}") }))
    : [];
  const ids = new Set(user.map((t) => t.id));
  return [...user, ...BUILTIN_TEMPLATES.filter((b) => !ids.has(b.id))];
}

// ---- backend ---------------------------------------------------------------------------------

export interface ClipperState {
  folders: string[];
  templates: unknown;
}
export interface FolderReport {
  folder: string;
  approved: boolean;
  message: string;
}

export const clipperStateGet = () => invoke<ClipperState>("clipper_state_get");
export const clipperTemplatesSet = (templates: ClipTemplate[]) => invoke<void>("clipper_templates_set", { templates });
/** confirm=false returns the question to show; confirm=true approves after the user agreed. */
export const clipperFolderApprove = (folder: string, confirm: boolean) => invoke<FolderReport>("clipper_folder_approve", { folder, confirm });
export const clipperFolderRevoke = (folder: string) => invoke<void>("clipper_folder_revoke", { folder });
export const clipperWrite = (folder: string, sub: string | undefined, name: string, content: string) =>
  invoke<string>("clipper_write", { folder, sub, name, content });

/**
 * A `clip` request from the browser (lens://bridge/request): render with the default template;
 * write it when its folder is approved, otherwise return the note for the UI to confirm or copy.
 */
export async function clipFromBridge(req: {
  title?: string; url?: string; selection?: string; page_text?: string;
  meta?: ClipInput["meta"] | null;
}, templateId?: string): Promise<{ written?: string; pending?: RenderedClip & { folder?: string; mode: "approve" | "copy" } }> {
  const state = await clipperStateGet();
  const templates = normaliseTemplates(state.templates);
  const t = templates.find((x) => x.id === templateId) ?? templates[0];
  const r = renderClip(t, { title: req.title, url: req.url, selection: req.selection, pageText: req.page_text, meta: req.meta ?? undefined });
  const plan = planClip(t, state.folders);
  if (plan.mode === "write" && plan.folder) {
    return { written: await clipperWrite(plan.folder, t.subFolder, r.fileName, r.body) };
  }
  return { pending: { ...r, folder: plan.folder, mode: plan.mode === "approve" ? "approve" : "copy" } };
}
