// Test double for the extension APIs, used only by tools/shoot.mjs (never shipped).
// window.__LENS_MOCK = { scheme: "dark"|"light", selection?: string } is set before this runs.
(() => {
  const cfg = window.__LENS_MOCK || { scheme: "dark" };
  const THEMES = {
    dark: { scheme: "dark", preset: "obsidian", bg: "#09090b", fg: "#fafafa", accent: "#fafafa", radius: 8, font: "rounded-arial", reduceMotion: false },
    light: { scheme: "light", preset: "porcelain", bg: "#f7f7f8", fg: "#09090b", accent: "#09090b", radius: 8, font: "rounded-arial", reduceMotion: false },
  };
  const now = Date.now();
  const answers = [
    { clientId: "c1", action: "summarize", label: "Summary", variant: "key_points", state: "answered", engine: "local", at: now - 4 * 60e3,
      chips: ["Page · 12 KB", "lens-demo.example"], source: { title: "Why calm software wins", url: "https://lens-demo.example/blog/calm" },
      text: "- Calm tools reduce context switching.\n- Defaults matter more than options.\n- Fewer, better notifications." },
    { clientId: "c2", action: "translate", label: "Translation", targetLang: "Spanish", state: "answered", engine: "claude", at: now - 52 * 60e3,
      chips: ["Selection · 212 chars"], source: { title: "Release notes", url: "https://lens-demo.example/notes" },
      text: "Las herramientas tranquilas reducen los cambios de contexto." },
  ];
  const shelf = [
    { id: "s1", kind: "page", title: "Why calm software wins", url: "https://lens-demo.example/blog/calm", snippet: "Calm tools reduce context switching and…", addedMs: now - 3600e3 },
    { id: "s2", kind: "selection", title: "Quote on defaults", snippet: "Defaults matter more than options.", addedMs: now - 7200e3 },
    { id: "s3", kind: "answer", title: "Summary: Q3 planning doc", snippet: "Three goals: ship Lens Mini, Shelf sync, …", addedMs: now - 86400e3 },
    { id: "s4", kind: "image", title: "Dock mockup v4", url: "https://lens-demo.example/img/dock.png", snippet: "", addedMs: now - 2 * 86400e3 },
  ];
  const seg = (start, dur, text) => ({ start, dur, text });
  const transcript = {
    state: "ready", url: "https://www.youtube.com/watch?v=abcDEF12345", language: "English", auto: false, at: now,
    meta: { title: "Designing Calm Technology", channel: "Amber Case", lengthSeconds: 1834, videoId: "abcDEF12345" },
    segments: [
      seg(0, 4, "Thanks for having me. Today I want to talk about calm technology."), seg(4, 5, "The idea is old: Weiser and Brown wrote about it in 1995."),
      seg(9, 6, "Technology should require the smallest possible amount of attention."), seg(15, 6, "It should inform and create calm, not anxiety."),
      seg(21, 6, "It should make use of the periphery, the edges of our attention."), seg(27, 6, "A tea kettle is a great example: it tells you when it's ready."),
      seg(48, 6, "Now let's look at notifications on a modern phone."), seg(54, 7, "Most of them want the centre of your attention, all the time."),
      seg(61, 6, "That's the opposite of calm. So what can designers do?"), seg(90, 6, "First, pick the right amount of technology for the problem."),
      seg(96, 6, "Often the right amount is less than you think."),
    ],
  };
  transcript.summary = { words: 140, approxTokens: 190, segments: transcript.segments.length };
  const mem = { answers, transcript: cfg.transcript ? transcript : undefined, lensSettings: cfg.settings || { selectionButton: "all", defaultAction: "explain", sites: [], never: [] } };
  const area = {
    get: async (k) => (typeof k === "string" ? { [k]: mem[k] } : { ...mem }),
    set: async (o) => Object.assign(mem, o),
    remove: async (k) => delete mem[k],
  };
  const listeners = [];
  const emit = (m) => listeners.forEach((fn) => fn(m, {}, () => {}));
  const STREAM = "Calm software keeps you in flow: it asks for attention only when it matters, picks sensible defaults, and gets out of the way. The article argues that fewer, better-timed notifications beat clever features.";
  let n = 0;
  async function handle(msg) {
    switch (msg.type) {
      case "ping": return { ok: true, state: "ready", lens: "0.1.0" };
      case "theme": return { theme: THEMES[cfg.scheme] || null };
      case "prefs": return { preferLocal: true };
      case "answers": return answers;
      case "page-context": return { title: "Why calm software wins", url: "https://lens-demo.example/blog/calm", pageText: "x".repeat(12_400), selection: cfg.selection };
      case "shelf": return { ok: true, state: "ready", items: shelf };
      case "run": {
        const clientId = "run" + ++n;
        const rec = { clientId, action: msg.action, label: { explain: "Explanation", summarize: "Summary" }[msg.action] || msg.action, state: "running", engine: "local", text: "", at: Date.now(), source: { title: document.title, url: location.href } };
        let i = 0;
        const words = STREAM.split(" ");
        const tick = () => {
          i += 6;
          rec.text = words.slice(0, i).join(" ");
          if (i >= words.length) rec.state = "answered";
          emit({ type: "lens-answer", record: { ...rec } });
          if (rec.state !== "answered") setTimeout(tick, 40);
        };
        setTimeout(tick, 30);
        return { ok: true, clientId };
      }
      default: return { ok: true, state: "saved" };
    }
  }
  const BASE = "https://ext.mock/";
  window.chrome = {
    runtime: {
      getURL: (p) => BASE + p,
      getManifest: () => ({ version: "0.1.0" }),
      sendMessage: (m) => handle(m),
      onMessage: { addListener: (fn) => listeners.push(fn) },
      openOptionsPage: () => {},
    },
    storage: { local: area, session: area, onChanged: { addListener: () => {} } },
    tabs: { query: async () => [{ id: 1, url: "https://lens-demo.example/blog/calm", title: "Why calm software wins" }], onActivated: { addListener: () => {} } },
    permissions: { request: async () => true, contains: async () => true, remove: async () => true },
    windows: { getCurrent: async () => ({ id: 1 }) },
    sidePanel: { open: async () => {} },
  };
})();
