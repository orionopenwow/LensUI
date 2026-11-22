// Parity mock for Lens Command: the base harness mock plus Shelf, clipboard, templates and AI.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

const params = new URLSearchParams(location.search);
const W = globalThis as any;
const now = Date.now();

const templates = [
  ["summarise", "Summarise", "Key points, a TL;DR or a headline", ["key points", "tl;dr", "headline"]],
  ["explain", "Explain", "Explain simply, with an example", []],
  ["translate", "Translate", "Translate into another language", []],
  ["rewrite", "Rewrite", "Shorter, friendlier or more formal", ["shorter", "friendlier", "formal", "clearer"]],
  ["fix", "Fix spelling & grammar", "Corrects mistakes and changes nothing else", []],
  ["todo", "Make a to-do list", "Turn notes into checkboxes", []],
  ["extract", "Extract", "Pull out links, dates, emails or tables", ["link", "date", "email", "table"]],
  ["compare", "Compare", "Compare two Shelf items", []],
  ["ask-page", "Ask this page", "Ask a question about the current page", []],
  ["transcribe", "Transcribe", "Transcribe an audio or video file", []],
  ["note", "Note", "Save what you typed to the Shelf", []],
  ["clip", "Clipboard", "Search clipboard history", []],
  ["shelf", "Shelf", "Open the Shelf", []],
  ["theme", "Theme", "Switch theme or accent", []],
  ["focus", "Focus", "Start a focus session", []],
].map(([id, name, description, options]) => ({
  id, name, description, options, template: ["transcribe", "note", "clip", "shelf", "theme", "focus"].includes(id as string) ? "" : `Do ${id}: {selection}`,
  provider: id === "compare" ? "claude" : "local", input: "selection", output: "thread", builtin: true, enabled: true,
}));

const shelfItems = [
  { id: "s1", shelf: "default", kind: "page", title: "Rust 2024 edition guide", text: "x".repeat(18000), url: "https://doc.rust-lang.org/edition-guide/", tags: ["rust"], pinned: true },
  { id: "s2", shelf: "default", kind: "answer", title: "Summary — Q4 planning notes", text: "x".repeat(2600), tags: ["work"], pinned: false },
  { id: "s3", shelf: "default", kind: "selection", title: "“Calm technology engages both the center and the periphery…”", text: "x".repeat(640), url: "https://calmtech.com", tags: [], pinned: false },
  { id: "s4", shelf: "default", kind: "transcript", title: "Design review — 14 Nov.mp4", text: "x".repeat(42000), tags: ["meeting"], pinned: false },
  { id: "s5", shelf: "default", kind: "file", title: "budget-2027.xlsx", text: "", path: "C:\\Users\\u\\Documents\\budget-2027.xlsx", tags: [], pinned: false },
].map((i, n) => ({ html: null, source_app: null, local_only: false, created_ms: now - n * 3600_000, updated_ms: now, order: n, chars: i.text.length, approx_tokens: Math.ceil(i.text.length / 4), url: null, path: null, ...i }));

// A tiny grey/accent PNG thumbnail so image clips render.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAYAAAA6yNxSAAAFB0lEQVR4nBXOocryCgCA4XM5f7FYLBaLxWKxrLggA2EYZllxQQbCMMyy4oIMhGGYZcUFGVjeu3oP33MFz3//ApwEOA1wFuA8wEWAywBXAa4D3AQYBLgNcBfgPsBDgMcA0wBPAZ4DvAR4DfAWYBXgPcBHgM8AXwG+A+wD/AT4DfAX4H//QpyEOA1xFuI8xEWIyxBXIa5D3IQYhLgNcRfiPsRDiMcQ0xBPIZ5DvIR4DfEWYhXiPcRHiM8QXyG+Q+xD/IT4DfEX/gUinEQ4jXAW4TzCRYTLCFcRriPcRBhEuI1wF+E+wkOExwjTCE8RniO8RHiN8BZhFeE9wkeEzwhfEb4j7CP8RPiN8Bf9BWKcxDiNcRbjPMZFjMsYVzGuY9zEGMS4jXEX4z7GQ4zHGNMYTzGeY7zEeI3xFmMV4z3GR4zPGF8xvmPsY/zE+I3xF/8FEpwkOE1wluA8wUWCywRXCa4T3CQYJLhNcJfgPsFDgscE0wRPCZ4TvCR4TfCWYJXgPcFHgs8EXwm+E+wT/CT4TfCX/AVSnKQ4TXGW4jzFRYrLFFcprlPcpBikuE1xl+I+xUOKxxTTFE8pnlO8pHhN8ZZileI9xUeKzxRfKb5T7FP8pPhN8Zf+BTKcZDjNcJbhPMNFhssMVxmuM9xkGGS4zXCX4T7DQ4bHDNMMTxmeM7xkeM3wlmGV4T3DR4bPDF8ZvjPsM/xk+M3wl/0FcpzkOM1xluM8x0WOyxxXOa5z3OQY5LjNcZfjPsdDjscc0xxPOZ5zvOR4zfGWY5XjPcdHjs8cXzm+c+xz/OT4zfGX/wUKnBQ4LXBW4LzARYHLAlcFrgvcFBgUuC1wV+C+wEOBxwLTAk8Fngu8FHgt8FZgVeC9wEeBzwJfBb4L7Av8FPgt8Ff8BUqclDgtcVbivMRFicsSVyWuS9yUGJS4LXFX4r7EQ4nHEtMSTyWeS7yUeC3xVmJV4r3ER4nPEl8lvkvsS/yU+C3xV/4FKpxUOK1wVuG8wkWFywpXFa4r3FQYVLitcFfhvsJDhccK0wpPFZ4rvFR4rfBWYVXhvcJHhc8KXxW+K+wr/FT4rfBX/QVqnNQ4rXFW47zGRY3LGlc1rmvc1BjUuK1xV+O+xkONxxrTGk81nmu81Hit8VZjVeO9xkeNzxpfNb5r7Gv81Pit8Vf/BRqcNDhtcNbgvMFFg8sGVw2uG9w0GDS4bXDX4L7BQ4PHBtMGTw2eG7w0eG3w1mDV4L3BR4PPBl8NvhvsG/w0+G3w1/wFWpy0OG1x1uK8xUWLyxZXLa5b3LQYtLhtcdfivsVDi8cW0xZPLZ5bvLR4bfHWYtXivcVHi88WXy2+W+xb/LT4bfHX/gU6nHQ47XDW4bzDRYfLDlcdrjvcdBh0uO1w1+G+w0OHxw7TDk8dnju8dHjt8NZh1eG9w0eHzw5fHb477Dv8dPjt8Nf9BXqc9DjtcdbjvMdFj8seVz2ue9z0GPS47XHX477HQ4/HHtMeTz2ee7z0eO3x1mPV473HR4/PHl89vnvse/z0+O3x1/8FBpwMOB1wNuB8wMWAywFXA64H3AwYDLgdcDfgfsDDgMcB0wFPA54HvAx4HfA2YDXgfcDHgM8BXwO+B+wH/Az4HfA3/AVGnIw4HXE24nzExYjLEVcjrkfcjBiMuB1xN+J+xMOIxxHTEU8jnke8jHgd8TZiNeJ9xMeIzxFfI75H7Ef8jPgd8Tfi/x5YRbufsZj3AAAAAElFTkSuQmCC";
const clips = [
  { id: 9, kind: "text", preview: "Ship the Command surface behind a setting first, then turn it on for the beta channel once parity is green.", chars: 108, hasHtml: true, fileCount: 0, sourceApp: "C:\\x\\Code.exe", tsMs: now - 20_000, pinned: false, localOnly: false },
  { id: 8, kind: "link", preview: "https://github.com/orionopenwow/LensUI/pull/7", chars: 46, hasHtml: false, fileCount: 0, sourceApp: "C:\\x\\chrome.exe", tsMs: now - 600_000, pinned: false, localOnly: false },
  { id: 7, kind: "image", preview: "", chars: 0, hasHtml: false, fileCount: 0, thumbPng: PNG, imageSize: [1920, 1080], sourceApp: "C:\\x\\SnippingTool.exe", tsMs: now - 3_600_000, pinned: false, localOnly: false },
  { id: 6, kind: "text", preview: "API_BASE=https://api.internal.example  # staging", chars: 48, hasHtml: false, fileCount: 0, sourceApp: "C:\\x\\WindowsTerminal.exe", tsMs: now - 7_200_000, pinned: false, localOnly: true },
  { id: 5, kind: "files", preview: "C:\\Users\\u\\Desktop\\brief.pdf C:\\Users\\u\\Desktop\\notes.md", chars: 58, hasHtml: false, fileCount: 2, sourceApp: "C:\\Windows\\explorer.exe", tsMs: now - 86_400_000, pinned: false, localOnly: false },
  { id: 4, kind: "text", preview: "Thanks — I'll review the Shelf export format tomorrow morning.", title: "Reply to Sam", chars: 62, hasHtml: false, fileCount: 0, sourceApp: "C:\\x\\OUTLOOK.EXE", tsMs: now - 2 * 86_400_000, pinned: true, localOnly: false },
];
const clipSettings = { enabled: params.get("clipoff") !== "1", maxItems: 500, maxDays: 30, maxTotalBytes: 67108864, maxItemBytes: 2097152, excludedApps: ["1password.exe", "bitwarden.exe", "keepassxc.exe"], captureImages: true, captureFiles: true, preferPlainPaste: false };

const extra: Record<string, (a: any) => any> = {
  command_templates: () => ({ templates, error: null, path: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\commands.json" }),
  ai_status: () => ({
    providers: [
      { id: "script", kind: "script", label: "Offline", available: true, is_local: true, needs_key: false, has_key: false },
      { id: "ollama", kind: "local", label: "Ollama", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: true },
    ],
    active: "ollama",
    privacy: "ask_each_time",
  }),
  ai_intent: (a) => (a.text ? { action: "set_theme", args: { pack: "nord-frost" }, confidence: 0.92, summary: "Switch theme to Nord Frost" } : null),
  ai_ask: () => "req-1",
  clip_status: () => ({ enabled: clipSettings.enabled, pausedUntilMs: 0, ignoreNext: false, count: clips.length, pinned: 1, settings: clipSettings }),
  clip_list: (a) => {
    const q = (a.query ?? "").toLowerCase();
    return clips.filter((c) => (!a.kind || c.kind === a.kind) && (!q || c.preview.toLowerCase().includes(q)));
  },
  clip_get_text: (a) => clips.find((c) => c.id === a.id)?.preview ?? "",
  shelves_list: () => [
    { id: "default", name: "Shelf", created_ms: now, item_count: shelfItems.length, approx_tokens: shelfItems.reduce((n, i) => n + i.approx_tokens, 0) },
    { id: "research", name: "Research", created_ms: now, item_count: 12, approx_tokens: 48000 },
  ],
  shelf_list: () => shelfItems,
  shelf_as_context: (a) => ({ text: "### Page — Rust 2024 edition guide\n\n…", approx_tokens: 4500, trimmed: [], local_only: false, item_count: a.ids?.length ?? 0 }),
  get_config: async () => {
    const c = await baseInvoke("get_config");
    return { ...(c as object), command: { enabled: true, width: Number(params.get("w") || 640), autoAttach: [] } };
  },
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (extra[cmd]) return (await extra[cmd](args ?? {})) as T;
  return baseInvoke<T>(cmd, args);
}
W.__lensCommandMock = true;
