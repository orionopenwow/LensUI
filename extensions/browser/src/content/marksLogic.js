// Pure logic for the in-page Lens marks: the tiny Lens orb that appears beside a tweet's action
// row, in YouTube's player controls, on videos, images, 3D models, code blocks, file links…
// and opens a short command list. Shared by the browser extension and Lens Browser.
// Classic script (no imports/exports): attaches globalThis.LensMarks. Also loaded by bun tests.
(function (root) {
  "use strict";

  /** Built-in placements. `hosts` empty = any site. Each is off until the person turns it on. */
  const ADAPTERS = [
    { id: "x", label: "X / Twitter posts", hosts: ["x.com", "twitter.com"], kind: "post" },
    { id: "youtube", label: "YouTube player and videos", hosts: ["youtube.com", "m.youtube.com"], kind: "yt" },
    { id: "reddit", label: "Reddit posts and comments", hosts: ["reddit.com"], kind: "thread" },
    { id: "hn", label: "Hacker News", hosts: ["news.ycombinator.com"], kind: "thread" },
    { id: "github", label: "GitHub repos, code and releases", hosts: ["github.com"], kind: "repo" },
    { id: "search", label: "Google / Bing results", hosts: ["google.com", "bing.com", "duckduckgo.com"], kind: "result" },
    { id: "music", label: "Spotify / SoundCloud web", hosts: ["open.spotify.com", "soundcloud.com"], kind: "track" },
    { id: "docs", label: "Docs, Notion, Google Docs", hosts: ["notion.so", "docs.google.com"], kind: "doc" },
    { id: "media", label: "Videos and audio on any site", hosts: [], kind: "media" },
    { id: "images", label: "Images on any site", hosts: [], kind: "image" },
    { id: "models", label: "3D models (.glb, .gltf, model-viewer)", hosts: [], kind: "model" },
    { id: "code", label: "Code blocks on any site", hosts: [], kind: "code" },
    { id: "files", label: "Download links (.zip, .exe, .msi…)", hosts: [], kind: "file" },
  ];

  /** Sites offered in the onboarding chip (one click turns these adapters on). */
  const ONBOARDING = ["x", "youtube", "github", "media", "code"];

  // id → [icon, label, hotkey?]. Icons are names from the dashboard icon set.
  const A = {
    shelf: ["bookmark", "Save to Shelf"],
    md: ["copy", "Copy as Markdown"],
    quote: ["quote", "Copy as quote card"],
    article: ["doc", "Thread → clean article"],
    summarize: ["spark", "Summarise"],
    translate: ["globe", "Translate"],
    explain: ["spark", "Explain"],
    context: ["layers", "Add to context pack"],
    claude: ["send", "Send to Claude"],
    ask: ["chat", "Ask about this"],
    transcript: ["text", "Transcript → Shelf"],
    transcriptCopy: ["copy", "Copy transcript"],
    chapters: ["list", "Chapters → notes"],
    clip: ["link", "Copy link at this moment"],
    frame: ["camera", "Copy this frame"],
    offline: ["download", "Save offline (YouTube's own)"],
    queue: ["music", "Add to Lens Music"],
    pip: ["pip", "Picture-in-picture"],
    loop: ["loop", "Loop"],
    speed: ["speed", "Speed 1.5×"],
    saveFile: ["download", "Save file"],
    transcribe: ["mic", "Transcribe"],
    copyImage: ["copy", "Copy image"],
    palette: ["palette", "Copy palette"],
    theme: ["palette", "Make a Lens theme"],
    wallpaper: ["image", "Set as wallpaper"],
    similar: ["search", "Search similar"],
    modelPreview: ["cube", "Preview in Lens"],
    artcraft: ["cube", "Send to ArtCraft"],
    copyCode: ["copy", "Copy clean"],
    runCode: ["play", "Run in Lens (asks first)"],
    snippet: ["bookmark", "Save snippet"],
    install: ["download", "Install with Lens Apps"],
    verify: ["shield", "Verify before opening"],
    readme: ["spark", "Summarise README"],
    clone: ["copy", "Copy clone command"],
    raw: ["copy", "Copy raw file"],
    peek: ["eye", "Summarise without opening"],
    openLens: ["window", "Open in Lens Browser"],
    lyrics: ["music", "Lyrics & visualizer in Lens"],
    note: ["doc", "Save as note"],
  };

  /** The command list for each kind of thing, best first (the list shows at most 6). */
  const KIND_ACTIONS = {
    post: ["shelf", "md", "summarize", "translate", "article", "quote", "context", "claude"],
    yt: ["transcript", "summarize", "clip", "chapters", "frame", "transcriptCopy", "ask", "queue", "offline"],
    thread: ["shelf", "summarize", "md", "translate", "context"],
    repo: ["install", "readme", "clone", "context", "shelf"],
    ghcode: ["copyCode", "explain", "raw", "snippet", "runCode"],
    ghasset: ["verify", "install", "shelf"],
    result: ["peek", "shelf", "openLens"],
    track: ["queue", "lyrics", "shelf"],
    doc: ["claude", "note", "summarize"],
    media: ["pip", "frame", "transcribe", "loop", "speed", "saveFile"],
    image: ["copyImage", "palette", "theme", "wallpaper", "similar", "shelf"],
    model: ["modelPreview", "artcraft", "saveFile", "shelf"],
    code: ["copyCode", "explain", "snippet", "runCode"],
    file: ["verify", "install", "saveFile"],
  };

  const MAX_ROWS = 6;

  function normalizeHost(h) {
    return String(h || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  }
  function hostMatches(host, list) {
    const h = normalizeHost(host);
    return list.some((x) => h === x || h.endsWith("." + x));
  }

  /** Adapters that apply on a host (site-specific ones only on their sites). */
  function adaptersFor(host) {
    return ADAPTERS.filter((a) => !a.hosts.length || hostMatches(host, a.hosts));
  }

  const DEFAULT_SETTINGS = Object.freeze({ on: false, adapters: [], never: [], last: {} });

  function sanitizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    const ids = new Set(ADAPTERS.map((a) => a.id));
    const last = {};
    for (const [k, v] of Object.entries(s.last && typeof s.last === "object" ? s.last : {}).slice(0, 300)) {
      if (A[v] && normalizeHost(k)) last[normalizeHost(k)] = v;
    }
    return {
      on: !!s.on,
      adapters: [...new Set((Array.isArray(s.adapters) ? s.adapters : []).filter((x) => ids.has(x)))],
      never: [...new Set((Array.isArray(s.never) ? s.never : []).map(normalizeHost).filter(Boolean))].slice(0, 500),
      last,
    };
  }

  /** Which adapters run on this host with these settings (none when off or the site is excluded). */
  function activeAdapters(settings, host) {
    const s = sanitizeSettings(settings);
    if (!s.on || hostMatches(host, s.never)) return [];
    return adaptersFor(host).filter((a) => s.adapters.includes(a.id));
  }

  /** Match patterns to register the marks script for (and the host permissions it needs). */
  function scriptMatches(settings) {
    const s = sanitizeSettings(settings);
    if (!s.on || !s.adapters.length) return { matches: [], excludeMatches: [] };
    const forHost = (h) => [`https://${h}/*`, `https://*.${h}/*`];
    const anySite = s.adapters.some((id) => !ADAPTERS.find((a) => a.id === id).hosts.length);
    const hosts = anySite ? null : [...new Set(s.adapters.flatMap((id) => ADAPTERS.find((a) => a.id === id).hosts))];
    return {
      matches: anySite ? ["https://*/*", "http://*/*"] : hosts.flatMap(forHost),
      excludeMatches: s.never.flatMap((h) => [`https://${h}/*`, `http://${h}/*`, `https://*.${h}/*`, `http://*.${h}/*`]),
    };
  }

  /** File kind from a URL's extension. */
  function fileKind(url) {
    let p = "";
    try {
      p = new URL(String(url), "https://x.invalid/").pathname.toLowerCase();
    } catch {
      return null;
    }
    if (/\.(glb|gltf|obj|stl|fbx|usdz|ply)$/.test(p)) return "model";
    if (/\.(zip|7z|rar|exe|msi|msix|appx|dmg|pkg|deb|rpm|appimage|tar\.gz|tgz)$/.test(p)) return "file";
    if (/\.(mp4|webm|mov|m4v|mkv)$/.test(p)) return "video";
    if (/\.(mp3|m4a|ogg|opus|wav|flac)$/.test(p)) return "audio";
    return null;
  }

  /**
   * Saving media is offered only for plain file URLs on sites that serve them as files: never for
   * blob:/MediaSource streams (how YouTube, Netflix, Twitch etc. deliver video, often with DRM),
   * never for encrypted media, and never on YouTube (it gets YouTube's own offline option instead).
   */
  function mediaSaveAllowed({ src, host, encrypted } = {}) {
    if (encrypted) return false;
    if (hostMatches(host, ["youtube.com", "youtu.be", "netflix.com", "primevideo.com", "disneyplus.com", "twitch.tv", "hulu.com", "max.com", "spotify.com"])) return false;
    const s = String(src || "");
    if (!/^https?:\/\//i.test(s)) return false; // blob:, data:, mediastream: → no
    return true;
  }

  /**
   * The rows for a context: { kind, host, canSave?, hasSelection? } → [{ id, icon, label, key }].
   * The site's last-used action floats to the top. "Save" rows drop out where saving isn't allowed.
   */
  function actionsFor(ctx, settings) {
    const kind = ctx?.kind;
    let ids = (KIND_ACTIONS[kind] || []).slice();
    if (ctx?.canSave === false) ids = ids.filter((id) => id !== "saveFile");
    if (kind === "yt" && ctx?.hasCaptions === false) ids = ids.filter((id) => !/^transcript|^chapters$/.test(id));
    const last = sanitizeSettings(settings).last[normalizeHost(ctx?.host)];
    if (last && ids.includes(last)) ids = [last, ...ids.filter((x) => x !== last)];
    return ids.map((id, i) => ({ id, icon: A[id][0], label: A[id][1], key: i < 9 ? String(i + 1) : "" }));
  }

  /** Filters rows by typed text (all words must appear), keeping order; at most MAX_ROWS. */
  function filterRows(rows, q) {
    const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const hit = rows.filter((r) => words.every((w) => r.label.toLowerCase().includes(w) || r.id.toLowerCase().includes(w)));
    return hit.slice(0, MAX_ROWS);
  }

  /** Remembers the last action per site (returns new settings). */
  function rememberLast(settings, host, id) {
    const s = sanitizeSettings(settings);
    if (!A[id]) return s;
    return sanitizeSettings({ ...s, last: { ...s.last, [normalizeHost(host)]: id } });
  }

  /** Where the mark sits relative to an anchor rect: inside its right end, vertically centred. */
  function markPosition(rect, vp, size = 18, inset = 6, corner = "right") {
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const top = corner === "corner" ? rect.top + inset : rect.top + (rect.height - size) / 2;
    const left = rect.left + rect.width - size - inset;
    return {
      left: Math.round(clamp(left, 2, vp.width - size - 2)),
      top: Math.round(clamp(top, 2, vp.height - size - 2)),
    };
  }

  /** Where the command list opens under (or above) the mark. */
  function menuPosition(mark, vp, w = 248, h = 268, gap = 6) {
    const below = mark.top + mark.size + gap;
    const top = below + h <= vp.height - 4 ? below : Math.max(4, mark.top - gap - h);
    const left = Math.min(Math.max(4, mark.left + mark.size - w), vp.width - w - 4);
    return { left: Math.round(left), top: Math.round(top) };
  }

  /** Markdown for a post/thread. */
  function toMarkdown({ author, handle, text, url, time } = {}) {
    const who = [author, handle ? `(@${String(handle).replace(/^@/, "")})` : ""].filter(Boolean).join(" ");
    const body = String(text || "").trim().split("\n").map((l) => `> ${l}`).join("\n");
    return `${body}\n>\n> — ${who || "Unknown"}${time ? `, ${time}` : ""}${url ? `\n\n${url}` : ""}`.trim();
  }

  /** YouTube link at a moment (whole seconds). */
  function timeLink(url, seconds) {
    try {
      const u = new URL(url);
      const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v");
      if (!id) return url;
      return `https://youtu.be/${id}?t=${Math.max(0, Math.floor(seconds || 0))}`;
    } catch {
      return url;
    }
  }

  /** Text for the Lens request each "send to Lens" action makes. */
  function requestText(id, c = {}) {
    const what = c.url || c.src || "";
    switch (id) {
      case "modelPreview": return `Preview this 3D model: ${what}`;
      case "artcraft": return `Open this 3D model in ArtCraft: ${what}`;
      case "theme": return `Make a Lens theme from these colours: ${(c.palette || []).join(" ")}`;
      case "wallpaper": return `Set this image as my wallpaper: ${what}`;
      case "install": return `Install with Lens Apps: ${what}`;
      case "verify": return `Check this download before I open it: ${what}`;
      case "runCode": return `Run this in Lens (ask me first):\n\n${c.code || ""}`;
      case "queue": return `Add to Lens Music: ${c.title || what}`;
      case "lyrics": return `Show lyrics and the visualizer for: ${c.title || what}`;
      case "openLens": return `Open in Lens Browser: ${what}`;
      case "similar": return `Find images like this: ${what}`;
      case "transcribe": return `Transcribe this media: ${what}`;
      default: return `${A[id]?.[1] || id}: ${what}`;
    }
  }

  root.LensMarks = {
    ADAPTERS, ONBOARDING, ACTIONS: A, KIND_ACTIONS, MAX_ROWS, DEFAULT_SETTINGS,
    normalizeHost, hostMatches, adaptersFor, sanitizeSettings, activeAdapters, scriptMatches, fileKind,
    mediaSaveAllowed, actionsFor, filterRows, rememberLast, markPosition, menuPosition, toMarkdown, timeLink, requestText,
  };
})(globalThis);
