/**
 * Lens Command's `/backdrop` ("/backdrop calm blue aurora"): hands the words to Backdrop Lab, which
 * turns them into a look (engine/inspire.ts promptToState) and opens on it. With no words it just
 * opens the Lab. A user template that already uses the word `backdrop` wins.
 */
import { invoke } from "@tauri-apps/api/core";
import { setPendingPrompt } from "./store";

const STUBS = new WeakSet<object>();

export function backdropTemplate(taken: { id: string }[]) {
  if (taken.some((t) => t.id === "backdrop")) return [];
  const t = {
    id: "backdrop",
    name: "Backdrop Lab",
    description: "Make a backdrop from words, e.g. /backdrop calm blue aurora",
    template: "",
    provider: "local",
    input: "none",
    options: [] as string[],
    output: "action",
    builtin: true,
    enabled: true,
  };
  STUBS.add(t);
  return [t];
}

export const isBackdropStub = (t: object | null | undefined) => !!t && STUBS.has(t);

export function runBackdropSlash(words: string): void {
  const text = words.trim();
  if (text) setPendingPrompt(text.slice(0, 200));
  invoke("open_surface", { label: "studio" }).catch(() => invoke("toggle_surface", { label: "studio" }).catch(() => {}));
}
