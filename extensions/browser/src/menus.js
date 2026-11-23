// The "Lens" right-click menu. Pure data + a lookup, so it can be tested and shared.
// Labels come from Lens's one action catalogue (src/context/actions.catalog.json, copied into
// catalog.gen.js by build.mjs), so the browser, Lens Browser, Explorer and Lens Mini agree.
import { CATALOG } from "./catalog.gen.js";

const label = (id, fallback) => CATALOG.actions.find((a) => a.id === id)?.label ?? fallback;

/** Only the YouTube video pages get "Get transcript". */
export const YOUTUBE_PATTERNS = ["*://www.youtube.com/watch*", "*://m.youtube.com/watch*", "*://www.youtube.com/shorts/*", "*://www.youtube.com/live/*"];

export const ALL = ["selection", "page", "link", "image", "video", "audio"];
const TEXTY = ["selection", "page", "link"];

export const LANGS = ["English", "Spanish", "French", "German", "Portuguese", "Japanese", "Chinese (Simplified)", "Korean", "Hindi", "Arabic"];

/**
 * Each entry: { id, title, contexts, parentId?, action?, variant?, targetLang?, local? , kind? }
 * kind: "ai" (streams into the side panel), "lens" (one-shot to Lens), "copy" (local only), "panel",
 *       "micro" (micro-save + in-page toast), "transcript" (YouTube captions → side panel).
 */
export function menuItems() {
  const items = [
    { id: "lens", title: "Lens", contexts: ALL },

    { id: "ask", parentId: "lens", title: `${label("ask", "Ask about this")} (local)`, contexts: ["selection", "page", "link", "image"], action: "ask", local: true, kind: "panel" },
    { id: "yt_transcript", parentId: "lens", title: label("yt_transcript", "Get transcript"), contexts: ["page", "video", "selection"], documentUrlPatterns: YOUTUBE_PATTERNS, kind: "transcript" },
    { id: "summarize", parentId: "lens", title: label("summarize", "Summarise"), contexts: TEXTY },
    { id: "summarize:tldr", parentId: "summarize", title: "TL;DR", contexts: TEXTY, action: "summarize", variant: "tldr", kind: "ai" },
    { id: "summarize:key_points", parentId: "summarize", title: "Key points", contexts: TEXTY, action: "summarize", variant: "key_points", kind: "ai" },
    { id: "summarize:detailed", parentId: "summarize", title: "Detailed", contexts: TEXTY, action: "summarize", variant: "detailed", kind: "ai" },
    { id: "explain", parentId: "lens", title: "Explain simply", contexts: ["selection", "link"], action: "explain", kind: "ai" },
    { id: "translate", parentId: "lens", title: "Translate", contexts: ["selection", "page"] },
    ...LANGS.map((l) => ({ id: `translate:${l}`, parentId: "translate", title: l, contexts: ["selection", "page"], action: "translate", targetLang: l, kind: "ai" })),
    { id: "rewrite", parentId: "lens", title: "Rewrite", contexts: ["selection"] },
    { id: "rewrite:shorter", parentId: "rewrite", title: "Shorter", contexts: ["selection"], action: "rewrite", variant: "shorter", kind: "ai" },
    { id: "rewrite:friendlier", parentId: "rewrite", title: "Friendlier", contexts: ["selection"], action: "rewrite", variant: "friendlier", kind: "ai" },
    { id: "rewrite:formal", parentId: "rewrite", title: "More formal", contexts: ["selection"], action: "rewrite", variant: "formal", kind: "ai" },
    { id: "fix_grammar", parentId: "lens", title: "Fix grammar", contexts: ["selection"], action: "fix_grammar", kind: "ai" },
    { id: "extract", parentId: "lens", title: "Extract", contexts: ["selection", "page"] },
    { id: "extract:tables", parentId: "extract", title: "Tables", contexts: ["selection", "page"], action: "extract", variant: "tables", kind: "ai" },
    { id: "extract:links", parentId: "extract", title: "Links", contexts: ["selection", "page"], action: "extract", variant: "links", kind: "ai" },
    { id: "extract:dates", parentId: "extract", title: "Dates", contexts: ["selection", "page"], action: "extract", variant: "dates", kind: "ai" },
    { id: "extract:todos", parentId: "extract", title: "To-dos", contexts: ["selection", "page"], action: "extract", variant: "todos", kind: "ai" },

    { id: "sep1", parentId: "lens", type: "separator", contexts: ALL },

    { id: "micro_save", parentId: "lens", title: label("micro_save", "Micro-save"), contexts: ["selection", "page", "link", "image"], action: "micro_save", kind: "micro" },
    { id: "shelf_add", parentId: "lens", title: label("shelf_add", "Add to Shelf"), contexts: ALL, action: "shelf_add", kind: "lens" },
    { id: "archive_save", parentId: "lens", title: label("archive_save", "Save page offline"), contexts: ["page"], action: "archive_save", kind: "archive" },
    { id: "clip", parentId: "lens", title: label("clip", "Clip to notes"), contexts: ["selection", "page"], action: "clip", kind: "clip" },
    { id: "copy_link", parentId: "lens", title: label("copy_link", "Copy clean link"), contexts: ["link", "page"], kind: "copy" },
    { id: "copy_md", parentId: "lens", title: "Copy as Markdown", contexts: ["selection", "page", "link"], kind: "copy" },
    { id: "context_add", parentId: "lens", title: label("context_add", "Load into context"), contexts: ["selection", "page"], action: "context_add", kind: "lens" },
    { id: "compare", parentId: "lens", title: "Compare with Shelf item…", contexts: ["selection", "page"], action: "compare", kind: "ai" },
    { id: "transcribe", parentId: "lens", title: "Transcribe video", contexts: ["video", "audio", "link", "page"], action: "transcribe", kind: "lens" },
    { id: "command_open", parentId: "lens", title: "Open in Lens Command", contexts: ALL, action: "command_open", kind: "lens" },
  ];
  return items;
}

export function findItem(id) {
  return menuItems().find((m) => m.id === id);
}

/** Strips our own fields before calling contextMenus.create. */
export function toCreateProps(item) {
  const p = { id: item.id, contexts: item.contexts };
  if (item.parentId) p.parentId = item.parentId;
  if (item.documentUrlPatterns) p.documentUrlPatterns = item.documentUrlPatterns;
  if (item.type) p.type = item.type;
  else p.title = item.title;
  return p;
}
