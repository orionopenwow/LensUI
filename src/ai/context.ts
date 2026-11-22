/**
 * Pure logic behind the context chips in the Ask panel: what is attached to a request, how it is shown,
 * whether sending it needs consent, and the "Continue in Claude" hand-off text. No React, no Tauri.
 */
import type { AiContext, AiPrivacy, AiProviderInfo } from "./surfaceApi";

export type ContextKind = "selection" | "clipboard" | "window" | "files" | "url" | "page";

export interface ContextChip {
  kind: ContextKind;
  /** Short label for the chip: "Selection · 42 words". */
  label: string;
  /** First line or two, shown in the chip's popover so the user sees exactly what will be sent. */
  preview: string;
  /** Characters this chip adds to the request. */
  chars: number;
}

const ORDER: ContextKind[] = ["selection", "clipboard", "window", "page", "url", "files"];

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function clip(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** One chip per non-empty context field, in a stable order. */
export function buildChips(ctx: AiContext): ContextChip[] {
  const chips: ContextChip[] = [];
  for (const kind of ORDER) {
    switch (kind) {
      case "selection":
        if (ctx.selection?.trim())
          chips.push({ kind, label: `Selection · ${words(ctx.selection)} words`, preview: clip(ctx.selection), chars: ctx.selection.length });
        break;
      case "clipboard":
        if (ctx.clipboard?.trim())
          chips.push({ kind, label: `Clipboard · ${words(ctx.clipboard)} words`, preview: clip(ctx.clipboard), chars: ctx.clipboard.length });
        break;
      case "window":
        if (ctx.window_title?.trim() || ctx.app_name?.trim()) {
          const t = [ctx.app_name, ctx.window_title].filter((x) => x && x.trim()).join(" — ");
          chips.push({ kind, label: ctx.app_name?.trim() ? `Window · ${ctx.app_name}` : "Window title", preview: clip(t), chars: t.length });
        }
        break;
      case "page":
        if (ctx.page_text?.trim())
          chips.push({ kind, label: `Page text · ${words(ctx.page_text)} words`, preview: clip(ctx.page_text), chars: ctx.page_text.length });
        break;
      case "url":
        if (ctx.url?.trim()) {
          let host = ctx.url;
          try {
            host = new URL(ctx.url).host || ctx.url;
          } catch {
            /* keep raw */
          }
          chips.push({ kind, label: `Link · ${host}`, preview: clip(ctx.url), chars: ctx.url.length });
        }
        break;
      case "files": {
        const f = (ctx.files ?? []).filter((x) => x.trim());
        if (f.length)
          chips.push({
            kind,
            label: f.length === 1 ? `File · ${base(f[0])}` : `${f.length} files`,
            preview: clip(f.map(base).join(", ")),
            chars: f.join("\n").length,
          });
        break;
      }
    }
  }
  return chips;
}

/** Returns a copy of the context with one kind removed. Removing "window" clears title and app name. */
export function removeContext(ctx: AiContext, kind: ContextKind): AiContext {
  const next: AiContext = { ...ctx };
  if (kind === "selection") delete next.selection;
  if (kind === "clipboard") delete next.clipboard;
  if (kind === "window") {
    delete next.window_title;
    delete next.app_name;
  }
  if (kind === "page") delete next.page_text;
  if (kind === "url") delete next.url;
  if (kind === "files") delete next.files;
  return next;
}

export function isContextEmpty(ctx: AiContext): boolean {
  return buildChips(ctx).length === 0;
}

/** True when this provider sends data off the PC. Unknown providers are treated as cloud (fail safe). */
export function isCloud(p: AiProviderInfo | undefined | null): boolean {
  if (!p) return true;
  if (p.kind === "script" || p.kind === "off") return false;
  return !p.is_local;
}

export type SendGate = "ok" | "consent" | "blocked" | "no-provider" | "needs-key";

/**
 * Decides what happens when the user presses Send.
 * - local_only + cloud provider -> blocked (the panel explains and offers a local provider)
 * - ask_each_time + cloud provider -> consent card (unless already consented for this request)
 * - allow_cloud -> ok
 * Local and script providers are always ok.
 */
export function sendGate(
  privacy: AiPrivacy,
  provider: AiProviderInfo | undefined | null,
  consented = false
): SendGate {
  if (!provider || provider.kind === "off") return "no-provider";
  if (!provider.available) return "no-provider";
  if (provider.needs_key && !provider.has_key) return "needs-key";
  if (!isCloud(provider)) return "ok";
  if (privacy === "local_only") return "blocked";
  if (privacy === "ask_each_time" && !consented) return "consent";
  return "ok";
}

/** The badge shown in the panel header. */
export function providerBadge(p: AiProviderInfo | undefined | null): { text: string; tone: "local" | "script" | "cloud" | "off" } {
  if (!p || p.kind === "off") return { text: "AI off", tone: "off" };
  if (p.kind === "script") return { text: "Script", tone: "script" };
  if (p.kind === "claude") return { text: "Claude", tone: "cloud" };
  return isCloud(p) ? { text: p.label, tone: "cloud" } : { text: "Local", tone: "local" };
}

export function privacyLabel(privacy: AiPrivacy): string {
  if (privacy === "local_only") return "Stays on this PC";
  if (privacy === "ask_each_time") return "Asks before sending";
  return "Cloud allowed";
}

/** Text for "Continue in Claude": the prompt plus every attached context block, clearly delimited. */
export function composeHandoff(prompt: string, ctx: AiContext, answer?: string): string {
  const parts: string[] = [];
  if (prompt.trim()) parts.push(prompt.trim());
  const block = (title: string, body: string) => parts.push(`--- ${title} ---\n${body.trim()}`);
  if (ctx.app_name || ctx.window_title) block("Window", [ctx.app_name, ctx.window_title].filter(Boolean).join(" — "));
  if (ctx.url) block("Link", ctx.url);
  if (ctx.selection) block("Selection", ctx.selection);
  if (ctx.clipboard) block("Clipboard", ctx.clipboard);
  if (ctx.page_text) block("Page text", ctx.page_text);
  if (ctx.files?.length) block("Files", ctx.files.join("\n"));
  if (answer?.trim()) block("Answer so far", answer);
  return parts.join("\n\n");
}

/** Strips context that must never leave the PC for a cloud provider when privacy says local-only. */
export function contextForProvider(ctx: AiContext, provider: AiProviderInfo | undefined | null, privacy: AiPrivacy): AiContext {
  if (isCloud(provider) && privacy === "local_only") return {};
  return ctx;
}

// ---------------------------------------------------------------- size, shelf and @-mentions

/** Rough token count: ~4 characters per token for English text. Good enough for a size hint. */
export function approxTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

/** Context + prompt size, plus any Shelf items (their own estimate from shelf_as_context / shelf_list). */
export function estimateTokens(prompt: string, ctx: AiContext, shelfTokens = 0): number {
  const ctxChars = buildChips(ctx).reduce((s, c) => s + c.chars, 0);
  return approxTokens(prompt.length + ctxChars) + Math.max(0, shelfTokens);
}

export function formatTokens(n: number): string {
  if (n < 1000) return `≈ ${n} tokens`;
  return `≈ ${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k tokens`;
}

/** Above this the strip warns that local models may cut the context. */
export const LARGE_CONTEXT_TOKENS = 8000;

/**
 * Finds an @-mention being typed at the caret: "summarise @meet|" -> { query: "meet", start: 10 }.
 * The @ must start the text or follow whitespace (so emails don't trigger it).
 */
export function mentionAt(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]{0,40})$/);
  if (!m) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}

/** Removes the "@query" being typed, leaving the rest of the prompt intact. */
export function stripMention(text: string, start: number, caret: number): { text: string; caret: number } {
  const next = (text.slice(0, start) + text.slice(caret)).replace(/ {2,}/g, " ");
  return { text: next, caret: start };
}

export interface ShelfLike {
  id: string;
  title?: string;
  text?: string;
  kind: string;
  source_app?: string;
  url?: string;
  path?: string;
}

export function shelfTitle(i: ShelfLike): string {
  return (i.title?.trim() || i.text?.trim().split("\n")[0] || i.path?.split(/[\\/]/).pop() || i.url || i.kind).slice(0, 60);
}

/** Shelf items matching an @-mention query (title, kind, app, text start); newest-first order is kept. */
export function filterShelf<T extends ShelfLike>(items: T[], q: string, exclude: string[] = [], limit = 6): T[] {
  const ql = q.toLowerCase();
  return items
    .filter((i) => !exclude.includes(i.id))
    .filter((i) =>
      !ql ||
      [shelfTitle(i), i.kind, i.source_app ?? "", (i.text ?? "").slice(0, 200)].some((f) => f.toLowerCase().includes(ql))
    )
    .slice(0, limit);
}

/** Folds resolved Shelf text into the request (the AI contract has no shelf field yet). */
export function withShelfText(ctx: AiContext, shelfText: string): AiContext {
  if (!shelfText.trim()) return ctx;
  // ai-core has its own field for Shelf text: attached, counted and privacy-gated like the rest.
  return { ...ctx, shelf_text: ctx.shelf_text?.trim() ? `${ctx.shelf_text}\n\n${shelfText.trim()}` : shelfText.trim() };
}
