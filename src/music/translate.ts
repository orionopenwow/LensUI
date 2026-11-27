// Lyric translation (opt-in): asks Lens's AI to translate the lyric lines, with the same privacy
// rules as every other AI request. The local model is used when one is running on this PC;
// otherwise the provider chosen in Settings › AI, and a cloud provider only as its privacy mode
// allows ("Ask each time" shows the usual Send / Don't send card first). Answers are saved on this
// PC (music_translation_put) so a song is only sent once per language. Pure parts are tested in
// src/__tests__/musicUpgrade.test.ts.
import type { LyricLine } from "./model";

export interface ProviderLike {
  id: string;
  kind: string;
  label: string;
  available: boolean;
  model: string;
  is_local: boolean;
}

/** Which AI translates, and how the card names it. `null` + reason when none can. */
export function chooseProvider(status: { providers: ProviderLike[]; active: string } | null): { provider: ProviderLike | null; reason: string } {
  if (!status) return { provider: null, reason: "Lens AI isn't available." };
  const local = status.providers.find((p) => p.kind === "local" && p.available);
  if (local) return { provider: local, reason: "" };
  const active = status.providers.find((p) => p.id === status.active);
  if (!active || active.kind === "off") return { provider: null, reason: "Turn on Lens AI in Settings › AI to translate lyrics." };
  if (active.kind === "script") return { provider: null, reason: "The built-in assistant can't translate. Start a local model (Ollama, LM Studio) or choose Claude in Settings › AI." };
  if (!active.available) return { provider: null, reason: `${active.label} isn't ready. Check Settings › AI.` };
  return { provider: active, reason: "" };
}

/** How the provider is named next to the translation ("Ollama · llama3.2 on this PC"). */
export function providerLabel(p: ProviderLike): string {
  const name = p.model ? `${p.label} · ${p.model}` : p.label;
  return p.is_local ? `${name}, on this PC` : name;
}

/** A stable 32-hex-character key from the lines and the language (four FNV-1a lanes). */
export function translationKey(lines: { text: string }[], language: string): string {
  const text = `v1\u001f${language.trim().toLowerCase()}\u001f${lines.map((l) => l.text.trim()).join("\n")}`;
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  return seeds
    .map((seed, lane) => {
      let h = seed >>> 0;
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i) + lane;
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16).padStart(8, "0");
    })
    .join("");
}

/** The lines sent to the model: numbered, blank lines kept as "♪" so the numbering holds. */
export function numberedLines(lines: LyricLine[]): string {
  return lines.map((l, i) => `${i + 1}| ${l.text.trim() || "♪"}`).join("\n");
}

export function translatePrompt(language: string, count: number): string {
  return [
    `Translate the song lyrics in the selection into ${language}.`,
    `Reply with exactly ${count} lines, numbered like the input ("1| …"), one translated line per input line, in the same order.`,
    "Keep \"♪\" lines as \"♪\". Keep names as they are. No notes, no explanations, nothing before or after the lines.",
  ].join(" ");
}

/** Reads the model's numbered reply back into one line per original line ("" where it gave none). */
export function parseTranslation(reply: string, count: number): string[] {
  const out: string[] = Array.from({ length: count }, () => "");
  let unnumbered: string[] = [];
  for (const raw of reply.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,4})\s*[|.):\-–]\s?(.*)$/.exec(line);
    if (m) {
      const i = Number(m[1]) - 1;
      if (i >= 0 && i < count) out[i] = m[2].trim() === "♪" ? "" : m[2].trim();
    } else unnumbered.push(line);
  }
  // A model that dropped the numbers but kept the line count still lines up.
  if (out.every((l) => !l) && unnumbered.length === count) unnumbered.forEach((l, i) => (out[i] = l === "♪" ? "" : l));
  unnumbered = [];
  return out;
}

/** The person's language as an English name ("French"), from the Windows display language. */
export function defaultLanguage(locale: string): string {
  try {
    const code = (locale || "en").split("-")[0];
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name || "English";
  } catch {
    return "English";
  }
}
