// Lens Command's way into Immersive: typing "immersive" (or "open immersive", "immersive mode")
// or picking `/immersive` opens Now Playing full screen. Offered only while Lens Music is on;
// opening goes through Rust's music_immersive_open, which refuses over a fullscreen app or game.
import { invoke } from "@tauri-apps/api/core";

const STUBS = new WeakSet<object>();

/** Exact phrases only, so "immersive reader" or questions still go to the normal Command flow. */
export function isImmersivePhrase(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  return /^(?:\/)?(?:open |show |start )?(?:music )?immersive(?: mode| music| now playing)?$/.test(t);
}

/** The `/immersive` tile, while Music is on and no user template already uses the word. */
export function immersiveTemplates(taken: { id: string }[], on: boolean) {
  if (!on || taken.some((t) => t.id === "immersive")) return [];
  const t = {
    id: "immersive",
    name: "Immersive",
    description: "Now Playing full screen: big artwork and synced lyrics. Esc leaves.",
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

export const isImmersiveStub = (t: object | null | undefined) => !!t && STUBS.has(t);

/** Opens Immersive; returns a line for Command if it couldn't. */
export async function openImmersive(): Promise<string | null> {
  try {
    await invoke("music_immersive_open", { from: "command" });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "Immersive couldn't open.";
  }
}
