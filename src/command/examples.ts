// Example commands shown under an empty Do-mode field, so nobody has to guess what Lens
// understands. Each one is a phrase the offline engine's own tests pin
// (src-tauri/src/ai/intent.rs; checked by src/__tests__/teach.test.ts), so an example can never
// be something Lens answers with "not sure what that means".
export interface DoExample {
  /** What is typed for the person when they pick it. They still press Enter to run it. */
  phrase: string;
  /** The offline intent it parses to. */
  action: string;
}

export const DO_EXAMPLES: DoExample[] = [
  { phrase: "dark mode", action: "set_color_mode" },
  { phrase: "make the dock slim", action: "set_dock_style" },
  { phrase: "next wallpaper", action: "next_wallpaper" },
  { phrase: "volume 40", action: "set_volume" },
];
