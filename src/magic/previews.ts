// Sample targets for the Settings preview and the parity screenshots: one per kind of thing the
// magic window can open on. Pure data.
import type { MagicOpen, MagicTarget } from "./contract";

const T = (p: Partial<MagicTarget> & Pick<MagicTarget, "kind" | "label">): MagicTarget => ({
  app: "",
  window: null,
  text: null,
  url: null,
  path: null,
  bounds: null,
  detail: "",
  id: null,
  ...p,
});

const WORD_WIN = T({ kind: "window", label: "Q4 planning.docx - Word", app: "WINWORD.EXE", window: 4242, detail: "WINWORD" });
const WORD_APP = T({ kind: "app", label: "WINWORD", app: "WINWORD.EXE", window: 4242, detail: "winword.exe", path: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE" });
const CHROME_WIN = T({ kind: "window", label: "Release notes · Lens UI - Google Chrome", app: "chrome.exe", window: 5151, detail: "chrome" });
const CHROME_APP = T({ kind: "app", label: "chrome", app: "chrome.exe", window: 5151, detail: "chrome.exe" });

export const PREVIEW_SETS: Record<string, MagicTarget[]> = {
  selection: [
    T({
      kind: "selection",
      label: "Ship the magic window behind a setting, then",
      text: "Ship the magic window behind a setting, then turn it on for the beta channel once parity is green.",
      app: "WINWORD.EXE",
      detail: "98 chars",
    }),
    WORD_WIN,
    WORD_APP,
  ],
  link: [
    T({ kind: "link", label: "Calm technology — principles", url: "https://calmtech.com/", app: "chrome.exe", window: 5151, detail: "calmtech.com" }),
    CHROME_WIN,
    CHROME_APP,
  ],
  image: [T({ kind: "image", label: "Dock styles contact sheet", app: "chrome.exe", window: 5151, detail: "1280×720" }), CHROME_WIN, CHROME_APP],
  file: [
    T({ kind: "file", label: "budget-2027.xlsx", path: "C:\\Users\\you\\Documents\\budget-2027.xlsx", app: "explorer.exe", window: 777, detail: "Documents" }),
    T({ kind: "window", label: "Documents - File Explorer", app: "explorer.exe", window: 777, detail: "explorer" }),
  ],
  window: [WORD_WIN, WORD_APP],
  desktop: [T({ kind: "desktop", label: "Desktop", detail: "background" })],
  dockItem: [T({ kind: "dockItem", label: "Visual Studio Code", detail: "lens", id: "code", path: "C:\\Users\\you\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe" })],
};

export const PREVIEW_TARGETS: { id: string; label: string }[] = [
  { id: "selection", label: "Selection" },
  { id: "link", label: "Link" },
  { id: "image", label: "Image" },
  { id: "file", label: "File" },
  { id: "window", label: "Window" },
  { id: "desktop", label: "Desktop" },
  { id: "dockItem", label: "Dock item" },
];

export function previewOpen(id: string, p: Partial<MagicOpen> = {}): MagicOpen {
  return {
    seq: 1,
    targets: PREVIEW_SETS[id] ?? PREVIEW_SETS.selection,
    x: 0,
    y: 0,
    flippedX: false,
    flippedY: false,
    monitor: 0,
    via: "mouse",
    resolveMs: 34,
    atMs: 0,
    run: null,
    ...p,
  };
}
