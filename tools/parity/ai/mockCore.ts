// Parity mock for the AI surfaces: wraps the shared Tauri core mock and adds the W6-A AI contract,
// the W6-C transcription contract and the Shelf contract. Behaviour is chosen per scene with URL params:
//   ?active=<provider id>&privacy=<local_only|ask_each_time|allow_cloud>&ai=off&stream=slow|fast|error|tool
import { invoke as baseInvoke, convertFileSrc, isTauri, calls } from "../mock/core";
import { emitLocal } from "../mock/event";

export { convertFileSrc, isTauri, calls };

const q = new URLSearchParams(location.search);
const stream = q.get("stream") || "fast";

const providers = [
  { id: "off", kind: "off", label: "Off", available: true, model: "", is_local: true, needs_key: false, has_key: false },
  { id: "script", kind: "script", label: "Script helper", available: true, model: "", is_local: true, needs_key: false, has_key: false },
  { id: "ollama", kind: "local", label: "Ollama", available: true, model: "qwen3:8b", is_local: true, needs_key: false, has_key: false, models: ["qwen3:8b", "llama3.2:3b", "gemma3:12b"] },
  { id: "lmstudio", kind: "local", label: "LM Studio", available: false, model: "", is_local: true, needs_key: false, has_key: false },
  { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: q.get("key") !== "none" },
];
let status = {
  providers,
  active: q.get("ai") === "off" ? "off" : q.get("active") || "ollama",
  privacy: q.get("privacy") || "ask_each_time",
  tools: { settings: true, windows: true, launch: false, titles: false },
};

const ANSWER = `Here's what's going on:

- **Spotify** and **Chrome** are both playing audio, so the fan spins up when a video renders.
- Your clipboard has a 3-step to-do from the standup.

To quiet it down, lower the render quality:

\`\`\`powershell
Set-ItemProperty -Path HKCU:\\Software\\Lens -Name RenderQuality -Value 2
\`\`\`

Want me to turn on **Focus** mode and mute Chrome? See [the docs](https://example.com/focus).`;

let n = 0;
function streamAnswer(id: string, provider: string, model: string) {
  const words = ANSWER.split(/(?<=\s)/);
  const per = stream === "slow" ? 140 : 8;
  const cut = stream === "slow" ? Math.floor(words.length * 0.45) : words.length;
  if (stream === "error") {
    setTimeout(() => emitLocal("lens://ai/done", { id, provider, model, error: "Ollama isn't answering on 127.0.0.1:11434. Is it running?" }), 120);
    return;
  }
  words.slice(0, cut).forEach((w, i) => setTimeout(() => emitLocal("lens://ai/delta", { id, text: w }), 60 + i * per));
  const end = 80 + cut * per;
  if (stream === "tool" || stream === "fast") {
    setTimeout(
      () =>
        emitLocal("lens://ai/tool-proposal", {
          id,
          call_id: `c${n}`,
          tool: "lens.set_focus_mode",
          args: { on: true, mute: ["chrome.exe"] },
          summary: "Turn on Focus mode and mute Chrome",
          risk: "medium",
        }),
      end + 20
    );
  }
  if (stream === "fast") {
    setTimeout(() => emitLocal("lens://ai/tool-result", { id, call_id: `c${n}`, ok: true, message: "Focus mode on · Chrome muted" }), end + 40);
  }
  if (stream !== "slow") setTimeout(() => emitLocal("lens://ai/done", { id, provider, model, usage: { input_tokens: 412, output_tokens: 168 } }), end + 60);
}

const shelf = [
  { id: "s1", kind: "page", title: "Lens roadmap — Q1 priorities", source_app: "Edge", approx_tokens: 1840 },
  { id: "s2", kind: "transcript", title: "Standup recording (Mon)", source_app: "Lens", approx_tokens: 3120 },
  { id: "s3", kind: "answer", title: "How to fix the fan noise", text: "Lower render quality…", approx_tokens: 210 },
  { id: "s4", kind: "file", title: "Q4 report.docx", path: "C:\\Users\\u\\Documents\\Q4 report.docx", approx_tokens: 5400 },
];

const ai: Record<string, (a: any) => any> = {
  ai_status: () => JSON.parse(JSON.stringify(status)),
  ai_set_config: (a) => {
    const c = a.config ?? {};
    status = { ...status, active: c.active ?? status.active, privacy: c.privacy ?? status.privacy, tools: c.tools ?? status.tools };
    return null;
  },
  ai_set_secret: () => {
    providers.find((p) => p.id === "claude")!.has_key = true;
    return null;
  },
  ai_clear_secret: () => {
    providers.find((p) => p.id === "claude")!.has_key = false;
    return null;
  },
  ai_ask: (a) => {
    const id = `req${++n}`;
    const p = providers.find((x) => x.id === (a.request?.provider ?? status.active)) ?? providers[2];
    (window as any).__lastAsk = a.request;
    if (a.request?.prompt === "Reply with the single word OK.") {
      setTimeout(() => emitLocal("lens://ai/done", { id, provider: p.id, model: p.model }), 60);
    } else streamAnswer(id, p.id, p.model);
    return id;
  },
  ai_cancel: (a) => {
    setTimeout(() => emitLocal("lens://ai/done", { id: a.id, provider: "ollama", model: "qwen3:8b", error: "cancelled" }), 10);
    return null;
  },
  ai_confirm_tool: () => null,
  ai_intent: (a) =>
    /night light/i.test(a.text) ? { action: "set_night_light", args: { on: true }, confidence: 0.93, summary: "Turn on night light" } : null,
  transcribe_file: () => {
    const id = "t1";
    [5, 18, 34, 52].forEach((pct, i) =>
      setTimeout(() => emitLocal("lens://transcribe/progress", { id, pct, stage: i === 0 ? "Loading model" : "Listening" }), 80 + i * 120)
    );
    return id;
  },
  shelf_list: () => shelf,
  shelf_as_context: (a) => ({ text: (a.ids ?? []).map((i: string) => `[${i}] shelf text`).join("\n"), approx_tokens: 100 }),
  shelf_add: () => "s9",
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (ai[cmd]) {
    calls.push(cmd);
    return ai[cmd](args ?? {}) as T;
  }
  return baseInvoke<T>(cmd, args);
}
