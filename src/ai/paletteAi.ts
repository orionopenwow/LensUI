/**
 * AI results for the Command Palette (and the Dock/top-bar search, which share the search engine).
 *
 * - Command-like queries ("turn on night light") call ai_intent (debounced). A confident, harmless intent
 *   becomes a one-key "Do it" result at the top; a risky or unsure one needs Enter twice.
 *   The local rule-based plan (parseNaturalLanguageActions) always wins when it matches, so ai_intent is
 *   only asked when Lens's own router has nothing.
 * - Question-like queries get an "Ask AI" result near the top; other longer queries get it at the bottom,
 *   just above "Search the web".
 * - "ai: …", "/ask …", "@ai …" open the Ask panel directly and hide everything else.
 *
 * Integration snippet: docs/AI_SURFACES.md §2.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchItem } from "../search/engine";
import { aiIntent, type AiIntent } from "./surfaceApi";
import { decideIntent, routeQuery, type QueryRoute } from "./intent";
import { clipboardActions, type QuickAction } from "./actions";

export interface AiPaletteHandlers {
  /** Opens the Ask panel inline with this prompt (and sends it). */
  openAsk: (prompt: string) => void;
  /** Runs a backend intent. Until client.ts exposes a direct runner, fall back to openAsk(text) with tools. */
  runIntent: (intent: AiIntent, text: string) => void;
  /** Runs a clipboard/notification quick action (see actions.ts). */
  runQuickAction?: (action: QuickAction) => void;
}

export interface AiPaletteInput {
  query: string;
  /** False when AI is off; then nothing is added. */
  enabled: boolean;
  /** True when Lens's local plan already matched this query. */
  hasLocalPlan: boolean;
  /** The intent for this exact query, or null/undefined while loading or when none. */
  intent?: AiIntent | null;
  /** Show clipboard quick actions when the query is empty or "clipboard". */
  clipboardPreview?: string;
}

/** Pure: which items to add for this query. Kept separate from the hook so it can be unit-tested. */
export function aiPaletteItems(input: AiPaletteInput, h: AiPaletteHandlers): { items: SearchItem[]; exclusive: boolean } {
  if (!input.enabled) return { items: [], exclusive: false };
  const route = routeQuery(input.query);
  const items: SearchItem[] = [];

  if (route.kind === "ask-exclusive") {
    return {
      exclusive: true,
      items: [
        {
          key: "ai-ask",
          kind: "nl",
          special: "top",
          title: route.prompt ? `Ask AI: ${route.prompt}` : "Type a question for AI",
          subtitle: "Answer appears here · Esc to go back",
          badge: "Ask",
          run: () => {
            if (route.prompt) h.openAsk(route.prompt);
          },
        },
      ],
    };
  }

  if (route.kind === "command" && !input.hasLocalPlan) {
    const d = decideIntent(input.intent);
    if (d.show && input.intent) {
      const intent = input.intent;
      items.push({
        key: `ai-intent:${intent.action}`,
        kind: "nl",
        special: "top",
        title: d.title,
        subtitle: d.subtitle,
        badge: "Do it",
        confirm: d.confirm ? `Press Enter again to ${d.title.charAt(0).toLowerCase()}${d.title.slice(1)}` : undefined,
        run: () => h.runIntent(intent, route.text),
      });
    }
  }

  const prompt = route.kind === "command" ? route.text : route.kind === "question" || route.kind === "maybe" ? route.prompt : "";
  if (prompt && !(route.kind === "command" && input.hasLocalPlan)) {
    items.push({
      key: "ai-ask",
      kind: "nl",
      special: route.kind === "question" ? "top" : "bottom",
      title: `Ask AI: ${prompt}`,
      subtitle: "Answer appears here",
      badge: "Ask",
      run: () => h.openAsk(prompt),
    });
  }

  const ql = input.query.trim().toLowerCase();
  if (h.runQuickAction && input.clipboardPreview && (ql === "clipboard" || ql === "clip")) {
    for (const a of clipboardActions()) {
      items.push({
        key: `ai-quick:${a.id}`,
        kind: "action",
        special: "top",
        title: a.title,
        subtitle: `Clipboard · ${input.clipboardPreview.slice(0, 60)}`,
        badge: "AI",
        run: () => h.runQuickAction?.(a),
      });
    }
  }

  return { items, exclusive: false };
}

/**
 * Hook: fetches the intent for command-like queries (debounced, latest query wins) and returns the
 * items to merge into the palette's results.
 */
export function useAiPaletteItems(
  query: string,
  opts: { enabled: boolean; hasLocalPlan: boolean; clipboardPreview?: string; debounceMs?: number },
  handlers: AiPaletteHandlers
) {
  const [intent, setIntent] = useState<{ q: string; intent: AiIntent | null } | null>(null);
  const seq = useRef(0);
  const route: QueryRoute = useMemo(() => routeQuery(query), [query]);

  useEffect(() => {
    if (!opts.enabled || route.kind !== "command" || opts.hasLocalPlan) return;
    const my = ++seq.current;
    const t = window.setTimeout(() => {
      aiIntent(route.text)
        .then((r) => {
          if (my === seq.current) setIntent({ q: query, intent: r });
        })
        .catch(() => {
          if (my === seq.current) setIntent({ q: query, intent: null });
        });
    }, opts.debounceMs ?? 220);
    return () => window.clearTimeout(t);
  }, [query, route, opts.enabled, opts.hasLocalPlan, opts.debounceMs]);

  return useMemo(
    () =>
      aiPaletteItems(
        {
          query,
          enabled: opts.enabled,
          hasLocalPlan: opts.hasLocalPlan,
          intent: intent && intent.q === query ? intent.intent : null,
          clipboardPreview: opts.clipboardPreview,
        },
        handlers
      ),
    // handlers are expected to be stable (useCallback) in the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, intent, opts.enabled, opts.hasLocalPlan, opts.clipboardPreview]
  );
}
