// Lens browser bridge — background (Chrome/Edge service worker, Firefox event page).
// Talks only to the native host `com.lensui.bridge` (Lens's own exe). No network, no analytics.

import { HOST_NAME, MAX_PAGE_TEXT_BYTES, buildRequest, markdownWithSource, mediaUrlFor } from "./protocol.js";
import { menuItems, findItem, toCreateProps } from "./menus.js";
import { readablePage } from "./readable.js";
import { ytPageTranscript } from "./content/ytPage.js";
import { showLensToast } from "./content/toast.js";
import { microItem, microToast } from "./micro.js";
import { cleanLinksInText, cleanUrl } from "./cleanUrl.js";
import { snapshotPage } from "./content/snapshot.js";
import { pageMeta } from "./content/pageMeta.js";
import { MAX_ARCHIVE_BYTES } from "./protocol.js";
import { isYoutubeVideoUrl, parseCaptions, toPlainText, transcriptShelfItem, transcriptSummary } from "./youtube.js";
import "./content/selectionLogic.js"; // attaches globalThis.LensSel
import "./content/marksLogic.js"; // attaches globalThis.LensMarks

const api = globalThis.browser ?? globalThis.chrome;
const IS_FIREFOX = !!(api.sidebarAction && globalThis.browser);
const VERSION = api.runtime.getManifest().version;
const BROWSER = IS_FIREFOX ? "firefox" : /Edg\//.test(navigator.userAgent) ? "edge" : "chrome";
const store = api.storage.session ?? api.storage.local;
const MAX_ANSWERS = 10;

// ---------------------------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------------------------

async function createMenus() {
  await api.contextMenus.removeAll();
  for (const item of menuItems()) {
    try {
      api.contextMenus.create(toCreateProps(item));
    } catch (e) {
      console.warn("Lens menu", item.id, e);
    }
  }
}
api.runtime.onInstalled.addListener(createMenus);
api.runtime.onStartup?.addListener(createMenus);

// ---------------------------------------------------------------------------------------------
// Page context
// ---------------------------------------------------------------------------------------------

async function inject(tabId, mode) {
  try {
    const [res] = await api.scripting.executeScript({ target: { tabId }, func: readablePage, args: [MAX_PAGE_TEXT_BYTES, mode] });
    return res?.result ?? null;
  } catch {
    return null; // browser pages, the web store, PDFs: no access
  }
}

async function gatherContext(tab, info, item) {
  const ctx = { url: tab?.url, title: tab?.title };
  if (info.linkUrl) ctx.linkUrl = info.linkUrl;
  if (info.mediaType === "image" && info.srcUrl) ctx.imageUrl = info.srcUrl;
  const wantsText = item.action !== "command_open" && item.action !== "transcribe";
  if (info.selectionText) {
    const sel = tab?.id != null ? await inject(tab.id, "selection") : null;
    ctx.selection = sel?.markdown || info.selectionText;
  } else if (wantsText && !info.linkUrl && !info.srcUrl && tab?.id != null) {
    const page = await inject(tab.id, "page");
    if (page?.markdown) ctx.pageText = page.markdown;
    if (page?.title) ctx.title = page.title;
  }
  if (item.action === "transcribe") ctx.mediaUrl = mediaUrlFor(info, tab?.url);
  if (item.action === "compare") ctx.shelfRef = "pick";
  if (item.action === "shelf_add") ctx.item = shelfItemFrom(ctx, info);
  return ctx;
}

function shelfItemFrom(ctx, info) {
  if (ctx.selection) return { kind: "selection", text: ctx.selection, title: ctx.title, url: ctx.url };
  if (ctx.imageUrl) return { kind: "image", url: ctx.imageUrl, title: ctx.title };
  if (info.linkUrl) return { kind: "text", title: info.linkText || info.linkUrl, url: info.linkUrl };
  if (ctx.pageText) return { kind: "page", text: ctx.pageText, title: ctx.title, url: ctx.url };
  return { kind: "text", title: ctx.title, url: ctx.url };
}

// ---------------------------------------------------------------------------------------------
// Native messaging
// ---------------------------------------------------------------------------------------------

function flash(text, ok = true) {
  api.action.setBadgeBackgroundColor?.({ color: ok ? "#3f3f46" : "#b91c1c" });
  api.action.setBadgeText({ text });
  setTimeout(() => api.action.setBadgeText({ text: "" }), 2500);
}

async function oneShot(action, ctx, opts = {}) {
  const quiet = !!opts.quiet;
  let req;
  try {
    req = buildRequest(action, ctx, { ...opts, browser: BROWSER, version: VERSION });
  } catch (e) {
    if (!quiet) flash("!", false);
    return { ok: false, error: String(e.message || e) };
  }
  try {
    const reply = await api.runtime.sendNativeMessage(HOST_NAME, req);
    if (!quiet) {
      flash(reply?.ok ? "✓" : "!", !!reply?.ok);
      await store.set({ lastReply: { at: Date.now(), action, reply } });
    }
    return reply;
  } catch (e) {
    if (!quiet) flash("!", false);
    return { ok: false, error: hostError(e) };
  }
}

function hostError(e) {
  const m = String(e?.message || e || "");
  if (/not found|not exist|forbidden|specified native messaging host/i.test(m)) {
    return "The Lens browser bridge isn't installed. In Lens: Settings → Connections → Browser extension → Install.";
  }
  return m || "Couldn't reach Lens.";
}

async function loadAnswers() {
  return (await store.get("answers")).answers ?? [];
}

async function saveAnswer(rec) {
  const answers = await loadAnswers();
  const i = answers.findIndex((a) => a.clientId === rec.clientId);
  if (i >= 0) answers[i] = rec;
  else answers.unshift(rec);
  await store.set({ answers: answers.slice(0, MAX_ANSWERS) });
  api.runtime.sendMessage({ type: "lens-answer", record: rec }).catch(() => {});
  // Requests from the in-page panel get their answers in that tab.
  if (rec.tabId != null) api.tabs.sendMessage(rec.tabId, { type: "lens-answer", record: rec }).catch(() => {});
}

function contextSummary(req) {
  const chips = [];
  if (req.selection) chips.push(`Selection · ${req.selection.length.toLocaleString()} chars`);
  if (req.pageText) chips.push(`Page · ${Math.round(req.pageText.length / 1024)} KB`);
  if (req.url) chips.push(new URL(req.url).hostname);
  if (req.linkUrl) chips.push("Link");
  if (req.imageUrl) chips.push("Image");
  if (req.question) chips.push(`“${req.question.slice(0, 60)}”`);
  return chips;
}

const LABELS = {
  ask: "Ask", summarize: "Summary", explain: "Explanation", translate: "Translation", rewrite: "Rewrite",
  fix_grammar: "Grammar fix", extract: "Extract", compare: "Comparison", define: "Definition",
};

async function runStream(action, ctx, opts = {}) {
  let req;
  try {
    req = buildRequest(action, ctx, { ...opts, stream: true, browser: BROWSER, version: VERSION });
  } catch (e) {
    flash("!", false);
    return null;
  }
  const clientId = `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const rec = {
    clientId, action, tabId: opts.tabId ?? null, label: LABELS[action] || action, variant: req.variant, targetLang: req.targetLang,
    title: req.title, url: req.url, chips: contextSummary(req), state: "sending", text: "", engine: null, error: null, at: Date.now(),
    source: { title: req.title, url: req.url },
  };
  await saveAnswer(rec);
  let port;
  try {
    port = api.runtime.connectNative(HOST_NAME);
  } catch (e) {
    await saveAnswer({ ...rec, state: "failed", error: hostError(e) });
    return;
  }
  port.onMessage.addListener(async (m) => {
    if (m.clientId && m.clientId !== clientId) return;
    if (m.type === "delta") rec.text += m.delta || "";
    if (m.engine) rec.engine = m.engine;
    if (m.state && !m.type) {
      // first reply
      rec.id = m.id;
      rec.state = m.ok ? m.state : "failed";
      rec.error = m.ok ? null : m.error;
      if (m.text) rec.text = m.text;
    }
    if (m.type === "state") rec.state = m.state;
    if (m.type === "done" || (!m.type && (!m.ok || !["pending", "running"].includes(m.state)))) {
      if (m.type === "done") {
        rec.state = m.ok ? "answered" : m.state || "failed";
        rec.error = m.ok ? null : m.error || null;
      }
      try {
        port.disconnect();
      } catch {
        /* already closed */
      }
    }
    await saveAnswer({ ...rec });
  });
  port.onDisconnect.addListener(async () => {
    const err = api.runtime.lastError?.message;
    if (["sending", "pending", "running"].includes(rec.state) && err) {
      await saveAnswer({ ...rec, state: "failed", error: hostError(err) });
    }
  });
  port.postMessage({ ...req, clientId });
  return clientId;
}

// ---------------------------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------------------------

function openPanel(tab) {
  // Must run synchronously inside the click handler (user gesture).
  try {
    if (IS_FIREFOX) api.sidebarAction.open();
    else if (api.sidePanel && tab?.id != null) api.sidePanel.open({ tabId: tab.id }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------
// Copy as Markdown (local only — nothing leaves the browser)
// ---------------------------------------------------------------------------------------------

async function copyMarkdown(tab, info, ctx, item) {
  let md = "";
  let text;
  if (item?.id === "copy_link") {
    // "Copy clean link": the link (or this page) without tracking parameters.
    text = cleanUrl(info.linkUrl || ctx.url || "");
  } else {
    if (ctx.selection) md = ctx.selection;
    else if (info.linkUrl) md = `[${(info.linkText || info.linkUrl).replace(/[[\]]/g, "")}](${cleanUrl(info.linkUrl)})`;
    else md = ctx.pageText || "";
    // Clean copy: links in what you copy lose their tracking parameters.
    text = cleanLinksInText(info.linkUrl && !ctx.selection ? md : markdownWithSource(md, ctx.title, cleanUrl(ctx.url || "")));
  }
  try {
    await api.scripting.executeScript({
      target: { tabId: tab.id },
      args: [text],
      func: (t) => {
        const fallback = () => {
          const ta = document.createElement("textarea");
          ta.value = t;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          ta.remove();
          return ok;
        };
        return navigator.clipboard ? navigator.clipboard.writeText(t).then(() => true, fallback) : fallback();
      },
    });
    flash("✓");
  } catch {
    flash("!", false);
  }
}

// ---------------------------------------------------------------------------------------------
// Micro-save: the selection (or the page's title + link) onto the Shelf, with a one-line toast
// in the page. Lens merges consecutive saves from one page into one item and skips repeats.
// ---------------------------------------------------------------------------------------------

async function microSave(tab, ctx) {
  const reply = await oneShot("micro_save", { item: microItem(ctx) }, { quiet: true });
  flash(reply?.ok ? "✓" : "!", !!reply?.ok);
  if (tab?.id != null && /^https?:/.test(tab.url || "")) {
    const [title, detail, tone] = microToast(reply);
    api.scripting.executeScript({ target: { tabId: tab.id }, func: showLensToast, args: [title, detail, tone] }).catch(() => {});
  }
  return reply;
}

// ---------------------------------------------------------------------------------------------
// YouTube transcripts: read the captions the page already loaded (activeTab, after a click).
// ---------------------------------------------------------------------------------------------

async function getTranscript(tab) {
  if (!tab?.id || !isYoutubeVideoUrl(tab.url || "")) {
    await store.set({ transcript: { state: "failed", error: "Open a YouTube video first.", at: Date.now() } });
    return null;
  }
  await store.set({ transcript: { state: "loading", url: tab.url, at: Date.now() } });
  api.runtime.sendMessage({ type: "lens-transcript" }).catch(() => {});
  let res = null;
  try {
    const [r] = await api.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: ytPageTranscript, args: [navigator.language || "en"] });
    res = r?.result ?? null;
  } catch (e) {
    res = { ok: false, reason: "no-access", message: String(e?.message || e) };
  }
  let rec;
  const segments = res?.ok ? parseCaptions(res.body) : [];
  if (res?.ok && segments.length) {
    rec = { state: "ready", url: tab.url, meta: res.meta, language: res.language, auto: !!res.auto, segments, at: Date.now() };
    rec.summary = transcriptSummary(rec);
  } else if (res?.reason === "no-captions" || (res?.ok && !segments.length)) {
    // No captions: offer Lens's own transcription (needs yt-dlp, set up in Lens; Lens shows the terms notice).
    rec = { state: "no-captions", url: tab.url, meta: res?.meta, at: Date.now() };
  } else {
    rec = { state: "failed", url: tab.url, meta: res?.meta, error: res?.message || "Couldn't read this video's captions.", at: Date.now() };
  }
  await store.set({ transcript: rec });
  api.runtime.sendMessage({ type: "lens-transcript" }).catch(() => {});
  return rec;
}

async function transcriptAction(kind, opts = {}) {
  const { transcript: t } = await store.get("transcript");
  if (kind === "transcribe") return oneShot("transcribe", { mediaUrl: t?.url, title: t?.meta?.title, url: t?.url });
  if (t?.state !== "ready") return { ok: false, error: "No transcript yet." };
  if (kind === "shelf") return oneShot("shelf_add", { item: transcriptShelfItem(t) }, { quiet: true });
  const ctx = { pageText: toPlainText(t.segments), title: `${t.meta?.title || "YouTube video"} (transcript)`, url: t.url };
  if (kind === "summarize") return { ok: !!(await runStream("summarize", ctx, { variant: opts.variant || "key_points" })) };
  if (kind === "ask") return { ok: !!(await runStream("ask", ctx, { question: opts.question, preferLocal: opts.preferLocal !== false })) };
  return { ok: false, error: "Unknown transcript action." };
}

// ---------------------------------------------------------------------------------------------
// Save page offline: an HTML snapshot (scripts removed, same-origin images inlined, size-capped)
// plus the page's readable text, saved by Lens with a Shelf item.
// ---------------------------------------------------------------------------------------------

async function toastIn(tab, title, detail, tone) {
  if (tab?.id == null || !/^https?:/.test(tab.url || "")) return;
  api.scripting.executeScript({ target: { tabId: tab.id }, func: showLensToast, args: [title, detail, tone] }).catch(() => {});
}

async function archivePage(tab) {
  if (tab?.id == null || !/^https?:/.test(tab.url || "")) return flash("!", false);
  let snap = null;
  try {
    const [r] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: snapshotPage, args: [MAX_ARCHIVE_BYTES - 8 * 1024] });
    snap = r?.result ?? null;
  } catch {
    snap = null;
  }
  if (!snap?.ok) {
    const why = snap?.reason === "too-large" ? "This page is too large to save offline from the browser." : "Couldn't copy this page.";
    flash("!", false);
    return toastIn(tab, "Not saved", why, "error");
  }
  const page = await inject(tab.id, "page");
  const reply = await oneShot("archive_save", { title: snap.title || tab.title, url: snap.url || tab.url, pageText: page?.markdown, archiveHtml: snap.html }, { quiet: true });
  flash(reply?.ok ? "✓" : "!", !!reply?.ok);
  const kb = Math.round((snap.bytes || 0) / 1024);
  const imgs = snap.inlinedImages ? `, ${snap.inlinedImages} image${snap.inlinedImages === 1 ? "" : "s"}` : "";
  return toastIn(tab, reply?.ok ? "Saved offline to your Shelf" : "Couldn't save", reply?.ok ? `${kb} KB${imgs}` : reply?.error || "", reply?.ok ? "ok" : "error");
}

// ---------------------------------------------------------------------------------------------
// Clip to notes: Lens renders your clipper template and saves the note into the folder you approved.
// ---------------------------------------------------------------------------------------------

async function clipPage(tab, info) {
  const ctx = { url: tab?.url, title: tab?.title };
  let meta = {};
  if (tab?.id != null && /^https?:/.test(tab.url || "")) {
    try {
      const [r] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: pageMeta });
      meta = r?.result || {};
    } catch {
      meta = {};
    }
    const sel = info?.selectionText ? await inject(tab.id, "selection") : null;
    if (sel?.markdown || info?.selectionText) ctx.selection = sel?.markdown || info.selectionText;
    const page = await inject(tab.id, "page");
    if (page?.markdown) ctx.pageText = page.markdown;
    if (page?.title) ctx.title = page.title;
  }
  ctx.url = cleanUrl(ctx.url || "");
  ctx.meta = meta;
  const reply = await oneShot("clip", ctx, { quiet: true });
  flash(reply?.ok ? "✓" : "!", !!reply?.ok);
  return toastIn(tab, reply?.ok ? "Sent to Lens to clip" : "Couldn't clip", reply?.ok ? "Lens saves it with your template" : reply?.error || "", reply?.ok ? "ok" : "error");
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

api.contextMenus.onClicked.addListener(async (info, tab) => {
  const item = findItem(String(info.menuItemId));
  if (!item || !item.kind) return;
  if (item.kind === "ai" || item.kind === "panel" || item.kind === "transcript") openPanel(tab);
  if (item.kind === "transcript") return getTranscript(tab);
  if (item.kind === "archive") return archivePage(tab);
  if (item.kind === "clip") return clipPage(tab, info);
  if (item.kind === "micro") {
    const ctx = { url: tab?.url, title: tab?.title, linkUrl: info.linkUrl, linkText: info.linkText };
    if (info.mediaType === "image" && info.srcUrl) ctx.imageUrl = info.srcUrl;
    if (info.selectionText) {
      const sel = tab?.id != null ? await inject(tab.id, "selection") : null;
      ctx.selection = sel?.markdown || info.selectionText;
    }
    return microSave(tab, ctx);
  }
  const ctx = await gatherContext(tab, info, item);
  if (item.kind === "copy") return copyMarkdown(tab, info, ctx, item);
  if (item.kind === "panel") {
    await store.set({ draft: { ctx, at: Date.now(), preferLocal: !!item.local } });
    api.runtime.sendMessage({ type: "lens-draft" }).catch(() => {});
    return;
  }
  if (item.kind === "ai") return runStream(item.action, ctx, { variant: item.variant, targetLang: item.targetLang, preferLocal: !!item.local });
  return oneShot(item.action, ctx);
});

api.commands?.onCommand.addListener(async (command) => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const sel = tab.id != null ? await inject(tab.id, "selection") : null;
  const ctx = { url: tab.url, title: tab.title, selection: sel?.markdown || undefined };
  if (command === "open-command") return oneShot("command_open", ctx);
  // Alt+Shift+S: micro-save the selection (or the page's title and link). Lens's own Ctrl+Alt+S
  // does the same in desktop apps; browsers don't allow Ctrl+Alt shortcuts for extensions.
  if (command === "add-to-shelf") return microSave(tab, ctx);
});

// Messages from the popup, side panel, options page and in-page panel.
async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Context for the current tab: selection (as Markdown) if any, plus the page as Markdown. */
async function tabContext(tab) {
  if (!tab) return {};
  const ctx = { url: tab.url, title: tab.title };
  if (tab.id == null || !/^https?:/.test(tab.url || "")) return ctx;
  const sel = await inject(tab.id, "selection");
  if (sel?.markdown) ctx.selection = sel.markdown;
  const page = await inject(tab.id, "page");
  if (page?.markdown) ctx.pageText = page.markdown;
  if (page?.title) ctx.title = page.title;
  return ctx;
}

const THEME_TTL_MS = 60_000;
async function themeTokens() {
  const { themeCache } = await api.storage.local.get("themeCache");
  if (themeCache && Date.now() - themeCache.at < THEME_TTL_MS) return themeCache.theme;
  const r = await oneShot("theme_get", {}, { quiet: true });
  const theme = r?.ok ? r.theme : themeCache?.theme ?? null;
  await api.storage.local.set({ themeCache: { at: Date.now(), theme } });
  return theme;
}

async function prefs() {
  const { lensPrefs } = await api.storage.local.get("lensPrefs");
  return { preferLocal: lensPrefs?.preferLocal !== false };
}

async function handleMessage(msg, sender) {
  const fromTab = sender?.tab?.id;
  switch (msg?.type) {
    case "ping":
      return oneShot("ping", {}, { quiet: true });
    case "ask": {
      await store.remove("draft");
      const clientId = await runStream("ask", msg.ctx || {}, { question: msg.question, preferLocal: !!msg.preferLocal, tabId: fromTab });
      return { ok: !!clientId, clientId };
    }
    case "run": {
      const clientId = await runStream(msg.action, msg.ctx || {}, {
        variant: msg.variant, targetLang: msg.targetLang, question: msg.question, preferLocal: !!msg.preferLocal, tabId: fromTab,
      });
      return clientId ? { ok: true, clientId } : { ok: false, error: "Lens couldn't build that request." };
    }
    case "page-context":
      return tabContext(await activeTab());
    case "shelf":
      return oneShot(msg.kind === "list" ? "shelf_list" : "shelf_recent", {}, { quiet: true, limit: msg.limit, shelf: msg.shelf });
    case "add-shelf": {
      const ctx = { ...(msg.ctx || {}) };
      ctx.item = shelfItemFrom(ctx, {});
      return oneShot("shelf_add", ctx, { quiet: !!fromTab });
    }
    case "shelf-answer":
      return oneShot("shelf_add", { item: { kind: "answer", text: msg.text, title: msg.title, url: msg.url } }, { quiet: !!fromTab });
    case "open-command":
      return oneShot("command_open", msg.ctx || {}, { quiet: !!fromTab });
    case "theme":
      return { theme: await themeTokens() };
    case "answers":
      return loadAnswers();
    case "prefs":
      return prefs();
    case "prefs-set":
      await api.storage.local.set({ lensPrefs: { preferLocal: !!msg.preferLocal } });
      return { ok: true };
    case "sync-content-scripts":
      return syncContentScripts();
    case "micro-save":
      return microSave(sender?.tab ?? (await activeTab()), msg.ctx || {});
    case "transcript-get":
      return (await store.get("transcript")).transcript ?? null;
    case "transcript-load":
      return getTranscript(await activeTab());
    case "transcript-shelf":
      return transcriptAction("shelf");
    case "transcript-run":
      return transcriptAction(msg.kind, msg);
    case "transcript-transcribe":
      return transcriptAction("transcribe");
    case "define": {
      // Double-click define/translate: local model only (Lens refuses rather than use the cloud).
      const ctx = { selection: String(msg.word || "").slice(0, 80), pageText: String(msg.sentence || "").slice(0, 600), url: sender?.tab?.url, title: sender?.tab?.title };
      const clientId = await runStream("define", ctx, {
        variant: msg.mode === "translate" ? "translate" : "define", targetLang: msg.mode === "translate" ? msg.lang : undefined,
        localOnly: true, preferLocal: true, tabId: fromTab,
      });
      return clientId ? { ok: true, clientId } : { ok: false, error: "Lens couldn't build that request." };
    }
    case "open-panel": {
      // "More in Lens…" from an in-page mark: the side panel where the browser allows it, else Command.
      try {
        if (api.sidePanel?.open && fromTab != null) {
          await api.sidePanel.open({ tabId: fromTab });
          return { ok: true };
        }
        if (api.sidebarAction?.open) {
          await api.sidebarAction.open();
          return { ok: true };
        }
      } catch {
        /* needs a user gesture in some browsers: fall through */
      }
      return oneShot("command_open", msg.ctx || {}, { quiet: true });
    }
    case "marks-sync":
      return syncMarksScript();
    case "archive-page":
      return archivePage(await activeTab());
    default:
      return null;
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

// ---------------------------------------------------------------------------------------------
// In-page selection button: registered only for sites the user opted into and granted.
// ---------------------------------------------------------------------------------------------

const SCRIPT_ID = "lens-selection";
const GUARD_ID = "lens-copy-guard";
const DEFINE_ID = "lens-define";

/** Registers one opt-in helper ("copyGuard" / "define") on the sites it may run on, or removes it. */
async function syncFeatureScript(settings, feature, id, js, runAt, allFrames) {
  try {
    await api.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    /* not registered */
  }
  const { matches, excludeMatches } = globalThis.LensSel.featureMatches(settings, feature);
  const granted = [];
  for (const m of matches) {
    if (await api.permissions.contains({ origins: [m] }).catch(() => false)) granted.push(m);
  }
  if (!granted.length) return 0;
  await api.scripting.registerContentScripts([
    { id, matches: granted, excludeMatches: excludeMatches.length ? excludeMatches : undefined, js, runAt, allFrames, persistAcrossSessions: false },
  ]);
  return granted.length;
}

async function syncContentScripts() {
  if (!api.scripting.registerContentScripts) return { ok: false, error: "This browser can't register scripts." };
  const { lensSettings } = await api.storage.local.get("lensSettings");
  const settings = globalThis.LensSel.sanitizeSettings(lensSettings);
  const { matches, excludeMatches } = globalThis.LensSel.contentScriptMatches(settings);
  // Only patterns the browser actually granted.
  const granted = [];
  for (const m of matches) {
    if (await api.permissions.contains({ origins: [m] }).catch(() => false)) granted.push(m);
  }
  try {
    await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    /* not registered */
  }
  await syncFeatureScript(settings, "copyGuard", GUARD_ID, ["src/content/cleanCopy.js"], "document_start", true);
  await syncFeatureScript(settings, "define", DEFINE_ID, ["src/content/selectionLogic.js", "src/content/define.js"], "document_idle", false);
  if (!granted.length) return { ok: true, registered: 0 };
  await api.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches: granted,
      excludeMatches: excludeMatches.length ? excludeMatches : undefined,
      js: ["src/content/selectionLogic.js", "src/ui/dashboard.js", "src/content/selection.js"],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: false, // re-registered on startup (Firefox doesn't persist)
    },
  ]);
  return { ok: true, registered: granted.length };
}

// In-page Lens marks (tweets, YouTube, videos, images, 3D models, code, downloads): opt-in.
const MARKS_ID = "lens-marks";
async function syncMarksScript() {
  if (!api.scripting.registerContentScripts) return { ok: false, error: "This browser can't register scripts." };
  try {
    await api.scripting.unregisterContentScripts({ ids: [MARKS_ID] });
  } catch {
    /* not registered */
  }
  const { lensMarks } = await api.storage.local.get("lensMarks");
  const { matches, excludeMatches } = globalThis.LensMarks.scriptMatches(lensMarks);
  const granted = [];
  for (const m of matches) {
    if (await api.permissions.contains({ origins: [m] }).catch(() => false)) granted.push(m);
  }
  if (!granted.length) return { ok: true, registered: 0 };
  await api.scripting.registerContentScripts([
    { id: MARKS_ID, matches: granted, excludeMatches: excludeMatches.length ? excludeMatches : undefined, js: MARKS_FILES, runAt: "document_idle", allFrames: false, persistAcrossSessions: false },
  ]);
  return { ok: true, registered: granted.length };
}
const MARKS_FILES = ["src/content/marksLogic.js", "src/content/marks.js"];

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lensSettings) syncContentScripts().catch(() => {});
  if (area === "local" && changes.lensMarks) {
    const before = globalThis.LensMarks.scriptMatches(changes.lensMarks.oldValue);
    const after = globalThis.LensMarks.scriptMatches(changes.lensMarks.newValue);
    // "last used" updates don't need re-registering.
    if (JSON.stringify(before) !== JSON.stringify(after)) syncMarksScript().catch(() => {});
  }
});
api.permissions?.onAdded?.addListener(() => syncMarksScript().catch(() => {}));
api.permissions?.onRemoved?.addListener(() => {
  syncContentScripts().catch(() => {});
  syncMarksScript().catch(() => {});
});
api.runtime.onInstalled.addListener(() => {
  syncContentScripts().catch(() => {});
  syncMarksScript().catch(() => {});
});
api.runtime.onStartup?.addListener(() => {
  syncContentScripts().catch(() => {});
  syncMarksScript().catch(() => {});
});
