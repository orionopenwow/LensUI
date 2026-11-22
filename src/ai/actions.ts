/**
 * Ready-made AI actions: clipboard quick actions, the notification digest and the file-drop actions.
 * Each builds a prompt plus the exact context that will be sent, so the Ask panel can show the chips
 * before anything leaves the PC. Pure; the caller decides where to send it.
 */
import type { AiContext } from "./contract.shim";

export interface QuickAction {
  id: string;
  title: string;
  /** Short verb for buttons: "Explain". */
  short: string;
  build: (input: { text: string; language?: string }) => { prompt: string; context: AiContext };
}

const clipCtx = (text: string): AiContext => ({ clipboard: text });

export function clipboardActions(): QuickAction[] {
  return [
    {
      id: "explain",
      title: "Explain what's on the clipboard",
      short: "Explain",
      build: ({ text }) => ({ prompt: "Explain this simply. Keep it short.", context: clipCtx(text) }),
    },
    {
      id: "translate",
      title: "Translate the clipboard",
      short: "Translate",
      build: ({ text, language }) => ({
        prompt: `Translate this into ${language?.trim() || "English"}. Reply with the translation only.`,
        context: clipCtx(text),
      }),
    },
    {
      id: "fix",
      title: "Fix spelling and grammar on the clipboard",
      short: "Fix grammar",
      build: ({ text }) => ({
        prompt: "Fix spelling and grammar. Keep the meaning, tone and formatting. Reply with the corrected text only.",
        context: clipCtx(text),
      }),
    },
    {
      id: "todo",
      title: "Turn the clipboard into a to-do list",
      short: "Make a to-do",
      build: ({ text }) => ({
        prompt: "Turn this into a short to-do list. One task per line, starting with '- [ ] '. No other text.",
        context: clipCtx(text),
      }),
    },
  ];
}

export interface DigestNotification {
  appName: string;
  title: string;
  body?: string;
  /** Unix ms. */
  time: number;
}

/** Caps what goes into the digest so a flood of notifications can't make a huge request. */
export const DIGEST_MAX_ITEMS = 40;
export const DIGEST_MAX_BODY = 200;

export function notificationDigest(items: DigestNotification[], now = Date.now()): { prompt: string; context: AiContext } {
  const recent = [...items].sort((a, b) => b.time - a.time).slice(0, DIGEST_MAX_ITEMS);
  const lines = recent.map((n) => {
    const mins = Math.max(0, Math.round((now - n.time) / 60000));
    const ago = mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
    const body = (n.body ?? "").replace(/\s+/g, " ").trim().slice(0, DIGEST_MAX_BODY);
    return `[${ago} ago] ${n.appName}: ${n.title}${body ? ` — ${body}` : ""}`;
  });
  return {
    prompt:
      "Summarise these notifications in 3–6 bullets, most important first. Group by app. Call out anything that needs a reply or has a deadline.",
    context: { page_text: lines.join("\n") },
  };
}

export type FileActionId = "summarise" | "transcribe" | "rename" | "ask";

export interface FileAction {
  id: FileActionId;
  title: string;
  /** Which files the action makes sense for. */
  accepts: (path: string) => boolean;
}

const ext = (p: string) => (p.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
export const MEDIA_EXT = ["mp3", "wav", "m4a", "flac", "ogg", "opus", "mp4", "mkv", "mov", "webm", "avi", "wma", "aac"];
export const TEXT_EXT = ["txt", "md", "pdf", "docx", "rtf", "html", "htm", "csv", "json", "log", "ts", "tsx", "js", "rs", "py", "srt", "vtt"];

export function fileActions(): FileAction[] {
  return [
    { id: "summarise", title: "Summarise", accepts: (p) => TEXT_EXT.includes(ext(p)) || MEDIA_EXT.includes(ext(p)) },
    { id: "transcribe", title: "Transcribe", accepts: (p) => MEDIA_EXT.includes(ext(p)) },
    { id: "rename", title: "Suggest better names", accepts: () => true },
    { id: "ask", title: "Ask about it…", accepts: () => true },
  ];
}

/** Actions that make sense for every dropped file, in menu order. */
export function actionsForFiles(paths: string[]): FileAction[] {
  if (!paths.length) return [];
  return fileActions().filter((a) => paths.every((p) => a.accepts(p)));
}

export function fileActionPrompt(id: Exclude<FileActionId, "transcribe">, paths: string[], question = ""): { prompt: string; context: AiContext } {
  const context: AiContext = { files: paths };
  if (id === "summarise") return { prompt: "Summarise the attached file(s) in a few bullets.", context };
  if (id === "rename")
    return {
      prompt:
        "Suggest a clear, specific file name for each attached file based on its contents. Keep extensions. Reply as 'old → new', one per line.",
      context,
    };
  return { prompt: question.trim() || "What is this?", context };
}
