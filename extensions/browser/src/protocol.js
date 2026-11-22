// Lens bridge protocol, extension side. Mirrors src-tauri/src/bridge/protocol.rs.
// Pure functions only (no chrome.* calls) so they run under `bun test`.

export const HOST_NAME = "com.lensui.bridge";
export const PROTOCOL_VERSION = 1;

export const MAX_PAGE_TEXT_BYTES = 200 * 1024;
export const MAX_SELECTION_CHARS = 50_000;
export const MAX_QUESTION_CHARS = 4_000;
export const MAX_TITLE_CHARS = 512;
export const MAX_URL_LEN = 4_096;

export const ACTIONS = [
  "ping", "status", "shelf_list", "shelf_recent", "theme_get", "ask", "summarize", "explain", "translate", "rewrite", "fix_grammar",
  "extract", "compare", "transcribe", "shelf_add", "context_add", "command_open",
];

export const AI_ACTIONS = new Set([
  "ask", "summarize", "explain", "translate", "rewrite", "fix_grammar", "extract", "compare",
]);

export const VARIANTS = {
  summarize: ["tldr", "key_points", "detailed"],
  rewrite: ["shorter", "friendlier", "formal"],
  extract: ["tables", "links", "dates", "todos"],
};

const encoder = new TextEncoder();

export function byteLength(s) {
  return encoder.encode(s).length;
}

/** Cuts a string to at most `maxBytes` UTF-8 bytes without splitting a character. */
export function truncateBytes(s, maxBytes, marker = "\n\n… (truncated by Lens)") {
  if (byteLength(s) <= maxBytes) return { text: s, truncated: false };
  const budget = Math.max(0, maxBytes - byteLength(marker));
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(s.slice(0, mid)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  let cut = lo;
  // Don't leave half of a surrogate pair.
  const code = s.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return { text: s.slice(0, cut) + marker, truncated: true };
}

function cleanText(s) {
  if (typeof s !== "string") return undefined;
  // Strip control characters except newline and tab.
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  return t.length ? t : undefined;
}

export function isWebUrl(u) {
  if (typeof u !== "string" || u.length > MAX_URL_LEN) return false;
  try {
    const p = new URL(u);
    return (p.protocol === "https:" || p.protocol === "http:") && !p.username && !p.password && !!p.hostname;
  } catch {
    return false;
  }
}

function webUrl(u) {
  return isWebUrl(u) ? u : undefined;
}

/**
 * Builds a request the native host (and Lens) will accept, applying the same caps Lens
 * enforces so the user gets a trimmed request instead of a rejection.
 */
export function buildRequest(action, ctx = {}, opts = {}) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action ${action}`);
  const req = { v: PROTOCOL_VERSION, action };
  const variants = VARIANTS[action];
  if (opts.variant) {
    if (!variants || !variants.includes(opts.variant)) throw new Error(`Bad option ${opts.variant} for ${action}`);
    req.variant = opts.variant;
  }
  if (opts.targetLang) req.targetLang = String(opts.targetLang).slice(0, 35);
  const q = cleanText(opts.question);
  if (q) req.question = q.slice(0, MAX_QUESTION_CHARS);

  const sel = cleanText(ctx.selection);
  if (sel) req.selection = sel.slice(0, MAX_SELECTION_CHARS);
  const title = cleanText(ctx.title);
  if (title) req.title = title.slice(0, MAX_TITLE_CHARS);
  for (const k of ["url", "linkUrl", "imageUrl", "mediaUrl"]) {
    const u = webUrl(ctx[k]);
    if (u) req[k] = u;
  }
  const page = cleanText(ctx.pageText);
  if (page) {
    const { text, truncated } = truncateBytes(page, MAX_PAGE_TEXT_BYTES);
    req.pageText = text;
    if (truncated) req.title = (req.title ? req.title + " " : "") + "(long page, trimmed)";
  }
  if (ctx.shelfRef) req.shelfRef = String(ctx.shelfRef).slice(0, 128);
  if (ctx.item) req.item = sanitizeItem(ctx.item);
  if (opts.preferLocal) req.preferLocal = true;
  if (opts.stream) req.stream = true;
  if (opts.id) req.id = String(opts.id);
  if (opts.limit) req.limit = Math.max(1, Math.min(50, Number(opts.limit) | 0));
  if (opts.shelf) req.shelf = String(opts.shelf).slice(0, 80);
  req.source = { browser: opts.browser || "chromium", extensionVersion: opts.version || "0" };
  return req;
}

const SHELF_KINDS = ["text", "page", "selection", "file", "image", "transcript", "answer"];

export function sanitizeItem(item) {
  const kind = SHELF_KINDS.includes(item.kind) ? item.kind : "text";
  const out = { kind };
  const t = cleanText(item.title);
  if (t) out.title = t.slice(0, MAX_TITLE_CHARS);
  if (typeof item.text === "string") out.text = truncateBytes(item.text, MAX_PAGE_TEXT_BYTES).text;
  const u = webUrl(item.url);
  if (u) out.url = u;
  if (Array.isArray(item.tags)) out.tags = item.tags.map(String).filter(Boolean).slice(0, 12);
  out.sourceApp = item.sourceApp || "Browser";
  // Never a local path from the browser.
  return out;
}

/** Markdown for "Copy as Markdown": the content, then a source line. */
export function markdownWithSource(markdown, title, url) {
  const body = (markdown || "").trim();
  if (!isWebUrl(url)) return body;
  const label = (title || url).replace(/[[\]]/g, "");
  return `${body}\n\n— Source: [${label}](${url})`;
}

/** The YouTube-style rule: transcribe a page URL only on known video hosts. */
export function looksLikeVideoPage(url) {
  if (!isWebUrl(url)) return false;
  const h = new URL(url).hostname.replace(/^www\./, "");
  return /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|dailymotion\.com|ted\.com|loom\.com)$/.test(h);
}

/** Picks what to transcribe from a context-menu click. Blob/data sources fall back to the page. */
export function mediaUrlFor(info, pageUrl) {
  for (const u of [info.srcUrl, info.linkUrl]) {
    if (isWebUrl(u)) return u;
  }
  return looksLikeVideoPage(pageUrl) ? pageUrl : undefined;
}
