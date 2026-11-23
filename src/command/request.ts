// Turns what the user typed + the context chips into one AI request. Pure; tested.
import type { AiContext, AiRequest, ProviderInfo } from "./ai";
import { chipBlocked, destinationOf, expandTemplate, type CommandTemplate, type Destination, type SlashParse } from "./parse";
import type { CommandProvider } from "./settings";
import type { ContextChip } from "./thread";

export interface BuiltRequest {
  req: AiRequest;
  dest: Destination;
  /** Chips that were left out because they must stay on this PC. */
  dropped: ContextChip[];
  /** Chips actually sent. */
  sent: ContextChip[];
  /** What the thread shows as the user's message. */
  display: string;
}

/** Picks the provider id for a command: user override → template default → active provider. */
export function resolveProvider(
  template: CommandTemplate | null,
  overrides: Record<string, CommandProvider>,
  providers: ProviderInfo[],
  active: string
): { id?: string; kind?: string } {
  const want = (template && overrides[template.id]) || template?.provider || "default";
  if (want === "default") {
    const p = providers.find((x) => x.id === active);
    return { id: undefined, kind: p?.kind ?? "local" };
  }
  const byKind = providers.find((p) => p.kind === want && p.available) ?? providers.find((p) => p.kind === want);
  return { id: byKind?.id ?? want, kind: want };
}

const joinText = (chips: ContextChip[]) =>
  chips
    .filter((c) => c.value)
    .map((c) => c.value!.trim())
    .join("\n\n");

export function buildRequest(opts: {
  text: string;
  slash: SlashParse | null;
  chips: ContextChip[];
  overrides: Record<string, CommandProvider>;
  providers: ProviderInfo[];
  active: string;
  shelfText?: string;
  allowTools?: boolean;
}): BuiltRequest {
  const template = opts.slash?.command ?? null;
  const prov = resolveProvider(template, opts.overrides, opts.providers, opts.active);
  const dest = destinationOf(prov.kind);
  const sent = opts.chips.filter((c) => !chipBlocked(c.localOnly, dest));
  const dropped = opts.chips.filter((c) => chipBlocked(c.localOnly, dest));
  const by = (s: ContextChip["source"]) => sent.filter((c) => c.source === s);

  const page = by("page")[0];
  const win = by("window")[0];
  const selectionLike = [...by("selection"), ...by("clip")];
  const clipboard = by("clipboard");
  const shelfChips = by("shelf");
  const shelfText = shelfChips.length ? opts.shelfText ?? joinText(shelfChips) : "";
  const files = by("file").map((c) => c.value ?? c.label);

  const context: AiContext = {};
  if (win) {
    context.window_title = win.value ?? win.label;
    if (win.detail) context.app_name = win.detail;
  }
  if (page?.url) context.url = page.url;
  if (files.length) context.files = files;

  let prompt: string;
  let display: string;
  if (template && template.template) {
    const args = opts.slash?.args ?? "";
    // The command acts on: a selection/clip chip, else the clipboard chip, else the page, else what was typed.
    const subject = joinText(selectionLike) || joinText(clipboard) || (page?.value ?? "") || args;
    prompt = expandTemplate(template.template, {
      selection: subject,
      clipboard: joinText(clipboard),
      shelf: shelfText,
      page: page?.value ?? "",
      title: page?.label ?? "",
      url: page?.url ?? "",
      lang: opts.slash?.lang ?? "",
      option: opts.slash?.option ?? "",
      input: args,
      date: new Date().toISOString().slice(0, 10),
    });
    display = `/${template.id}${opts.slash?.option ? " " + opts.slash.option : ""}${opts.slash?.lang ? " → " + opts.slash.lang : ""}${args && subject !== args ? " " + args : ""}`;
  } else {
    prompt = opts.text.trim();
    display = prompt;
    const sel = joinText(selectionLike);
    if (sel) context.selection = sel;
    const clip = joinText(clipboard);
    if (clip) context.clipboard = clip;
    if (page?.value) context.page_text = page.value;
    // ai-core attaches Shelf text in its own context field, privacy-gated like the rest.
    if (shelfText) context.shelf_text = shelfText;
  }
  return {
    req: { prompt, context, provider: prov.id, allow_tools: !!opts.allowTools },
    dest,
    dropped,
    sent,
    display,
  };
}
