import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { PLUGIN_SDK_SOURCE } from "./sdk";
import type { PluginManifest, PluginPermission } from "./types";
import { PLUGINS_CHANGED_EVENT } from "./types";

/**
 * Host side of the plugin sandbox.
 *
 * Each plugin runs in <iframe sandbox="allow-scripts">, loaded from its own file through the
 * asset protocol (see materializePluginDocument). It is NOT a srcdoc frame: a srcdoc document
 * inherits the Lens window's strict CSP (script-src 'self'), which blocks every plugin script.
 *  - no allow-same-origin: opaque origin, no cookies/storage, cannot touch the host DOM;
 *  - no allow-top-navigation / popups / forms / modals / downloads;
 *  - a CSP at the top of its document: no network (connect/img/font/media limited to data:),
 *    no frames, workers or objects;
 *  - the host window also restricts frame-src to the asset protocol (see lockDownFrames) so a
 *    plugin cannot navigate its own frame to a web page to smuggle data out in the URL.
 * The only channel out is postMessage, answered here by PluginBridge with permission checks.
 */

export const PLUGIN_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "manifest-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export const PLUGIN_SANDBOX = "allow-scripts";
export const PLUGIN_ALLOW =
  "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'; payment 'none'; fullscreen 'none'";

let framesLocked = false;
/** Frames in plugin-hosting windows may only come from the asset protocol (the plugin files).
 *  Only call from windows that host plugins and embed no other frames (Top Bar, Dock, Widget
 *  Drawer). Added on top of the app CSP; both policies apply. */
export const PLUGIN_FRAME_SOURCES = "asset: http://asset.localhost";

export function lockDownFrames(): void {
  if (framesLocked || typeof document === "undefined") return;
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = `frame-src ${PLUGIN_FRAME_SOURCES}; child-src ${PLUGIN_FRAME_SOURCES}`;
  document.head.appendChild(meta);
  framesLocked = true;
}

const THEME_VARS = [
  "--lens-fg",
  "--lens-fg-secondary",
  "--lens-fg-muted",
  "--lens-on-fg",
  "--lens-ink",
  "--lens-accent",
  "--lens-radius",
  "--font-sans",
];

function cssSafe(v: string): string {
  return v.replace(/[<>{};\\]/g, "").trim().slice(0, 200);
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Theme tokens a plugin may style itself with. `--lens-accent-safe` is the accent, or the
 *  text colour when the accent would be hard to see on the current surface. */
export function readThemeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const k of THEME_VARS) out[k] = cssSafe(cs.getPropertyValue(k));
  const scheme = document.documentElement.dataset.scheme === "light" ? "light" : "dark";
  out["--lens-scheme"] = scheme;
  // The plugin document must use the host's own color-scheme: if they differ, the browser
  // paints an opaque backdrop behind the frame instead of keeping it transparent.
  out["--lens-host-color-scheme"] = cssSafe(cs.colorScheme || "normal") || "normal";
  const base = cssSafe(cs.getPropertyValue("--lens-pack-base")) || (scheme === "light" ? "#f4f4f5" : "#09090b");
  const la = luminance(out["--lens-accent"]);
  const lb = luminance(base);
  let safe = out["--lens-accent"] || out["--lens-fg"];
  if (la !== null && lb !== null) {
    const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    if (ratio < 3) safe = out["--lens-fg"];
  }
  out["--lens-accent-safe"] = safe;
  return out;
}

/** Removes markup that could bypass or weaken the sandbox before the plugin runs:
 *  meta refresh / CSP / base / link prefetch & stylesheets / nested frames / objects. */
export function sanitizePluginHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("meta[http-equiv], base, link, iframe, frame, frameset, object, embed, portal, form")
    .forEach((el) => el.remove());
  const head = doc.head ? doc.head.innerHTML : "";
  const body = doc.body ? doc.body.innerHTML : "";
  return head + body;
}

/** The complete srcdoc for one plugin. Our CSP and SDK come first, before any plugin markup. */
export function buildPluginDocument(pluginHtml: string, theme: Record<string, string>): string {
  const vars = Object.entries(theme)
    .filter(([k]) => /^--[a-z-]+$/.test(k))
    .map(([k, v]) => `${k}:${cssSafe(v)};`)
    .join("");
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${PLUGIN_CSP}">` +
    `<meta name="referrer" content="no-referrer">` +
    `<style>:root{${vars}color-scheme:${/^(normal|light|dark|light dark|dark light)$/.test(theme["--lens-host-color-scheme"] ?? "") ? theme["--lens-host-color-scheme"] : "normal"};}` +
    `html,body{margin:0;padding:0;background:transparent;color:var(--lens-fg);` +
    `font-family:var(--font-sans);font-size:12px;-webkit-font-smoothing:antialiased;overflow:hidden;user-select:none;}</style>` +
    `<script>${PLUGIN_SDK_SOURCE}<\/script>` +
    `</head><body>` +
    sanitizePluginHtml(pluginHtml) +
    `</body></html>`
  );
}

// ------------------------------------------------------------------------------------------
// Bridge
// ------------------------------------------------------------------------------------------

export type BridgeError =
  | "permission-denied"
  | "approval-required"
  | "rate-limited"
  | "unknown-method"
  | "bad-params"
  | "unavailable";

const MAX_MESSAGE_CHARS = 16 * 1024;
const BUCKET_SIZE = 40;
const REFILL_PER_SEC = 20;
const STRIKES_TO_STOP = 50;
const NOTIFY_MIN_GAP_MS = 10_000;

interface InstalledApp {
  name: string;
  path: string;
}
let installedAppsCache: { at: number; apps: InstalledApp[] } | null = null;
async function installedApps(): Promise<InstalledApp[]> {
  if (installedAppsCache && Date.now() - installedAppsCache.at < 60_000) return installedAppsCache.apps;
  const apps = (await invoke<InstalledApp[]>("scan_installed_apps_cmd").catch(() => [])) ?? [];
  installedAppsCache = { at: Date.now(), apps };
  return apps;
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

export interface BridgeOptions {
  manifest: PluginManifest;
  /** Grants already approved by the user ("launch:<path>", "url:<origin>"). */
  grants: () => string[];
  /** Called when the plugin misbehaves badly enough to be stopped. */
  onStop: (reason: string) => void;
  /** Called after an approval request was filed (so the slot can show a badge). */
  onApprovalRequested?: () => void;
}

/** Answers one plugin's requests. Create one per iframe; call dispose() when it unmounts. */
export class PluginBridge {
  private tokens = BUCKET_SIZE;
  private lastRefill = Date.now();
  private strikes = 0;
  private lastNotify = 0;
  private stopped = false;
  private readonly onMessage: (ev: MessageEvent) => void;

  constructor(private frame: HTMLIFrameElement, private opts: BridgeOptions) {
    this.onMessage = (ev) => {
      // Only messages from this plugin's own frame; origin is "null" for every sandboxed
      // frame, so the source window is what identifies it.
      if (this.stopped || !this.frame.contentWindow || ev.source !== this.frame.contentWindow) return;
      void this.handle(ev.data);
    };
    window.addEventListener("message", this.onMessage);
  }

  dispose() {
    this.stopped = true;
    window.removeEventListener("message", this.onMessage);
  }

  /** Sends an event (tick, theme) to the plugin. */
  emit(event: "tick" | "theme", data?: unknown) {
    if (this.stopped) return;
    this.frame.contentWindow?.postMessage({ __lens: 1, event, data: data ?? null }, "*");
  }

  private has(p: PluginPermission) {
    return this.opts.manifest.permissions.includes(p);
  }

  private strike(reason: string) {
    this.strikes += 1;
    if (this.strikes >= STRIKES_TO_STOP && !this.stopped) {
      this.dispose();
      this.opts.onStop(reason);
    }
  }

  private take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(BUCKET_SIZE, this.tokens + ((now - this.lastRefill) / 1000) * REFILL_PER_SEC);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private reply(id: number, ok: boolean, payload: unknown) {
    if (this.stopped) return;
    const msg = ok ? { __lens: 1, id, ok: true, result: payload ?? null } : { __lens: 1, id, ok: false, error: payload };
    this.frame.contentWindow?.postMessage(msg, "*");
  }

  private async handle(data: unknown) {
    let size = 0;
    try {
      size = JSON.stringify(data)?.length ?? 0;
    } catch {
      return this.strike("unserializable message");
    }
    if (size > MAX_MESSAGE_CHARS) return this.strike("oversized message");
    if (!data || typeof data !== "object") return;
    const m = data as { __lens?: unknown; id?: unknown; method?: unknown; params?: unknown };
    if (m.__lens !== 1 || typeof m.id !== "number" || !Number.isSafeInteger(m.id) || typeof m.method !== "string") return;
    const id = m.id;
    if (!this.take()) {
      this.strike("rate limit");
      return this.reply(id, false, "rate-limited");
    }
    try {
      const result = await this.dispatch(m.method, m.params);
      this.reply(id, true, result);
    } catch (e) {
      const code = e instanceof BridgeFailure ? e.code : "unavailable";
      this.reply(id, false, code);
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
    const pluginId = this.opts.manifest.id;
    switch (method) {
      case "time.now":
        return Date.now();
      case "theme.get":
        return readThemeVars();
      case "telemetry.get": {
        if (!this.has("telemetry")) throw new BridgeFailure("permission-denied");
        const t = await invoke<Record<string, unknown>>("get_telemetry_cmd");
        return {
          cpuUsage: Number(t?.cpuUsage) || 0,
          memPercent: Number(t?.memPercent) || 0,
          memUsedGb: Number(t?.memUsedGb) || 0,
          memTotalGb: Number(t?.memTotalGb) || 0,
          uptimeMinutes: Number(t?.uptimeMinutes) || 0,
        };
      }
      case "media.get": {
        if (!this.has("media")) throw new BridgeFailure("permission-denied");
        const m = await invoke<Record<string, unknown>>("get_media_now_playing_cmd");
        const thumb = typeof m?.thumbnailDataUrl === "string" && m.thumbnailDataUrl.startsWith("data:image/") ? m.thumbnailDataUrl : null;
        return {
          hasSession: !!m?.hasSession,
          isPlaying: !!m?.isPlaying,
          title: String(m?.title ?? "").slice(0, 200),
          artist: String(m?.artist ?? "").slice(0, 200),
          album: String(m?.album ?? "").slice(0, 200),
          sourceApp: String(m?.sourceApp ?? "").slice(0, 80),
          thumbnailDataUrl: thumb,
        };
      }
      case "storage.get": {
        if (!this.has("storage")) throw new BridgeFailure("permission-denied");
        const key = str(p.key, 64);
        if (!key) throw new BridgeFailure("bad-params");
        const map = await invoke<Record<string, string>>("plugin_storage_get_cmd", { id: pluginId });
        return map?.[key] ?? null;
      }
      case "storage.set": {
        if (!this.has("storage")) throw new BridgeFailure("permission-denied");
        const key = str(p.key, 64);
        const value = p.value === null ? null : str(p.value, 4096);
        if (!key || (p.value !== null && value === null)) throw new BridgeFailure("bad-params");
        await invoke("plugin_storage_set_cmd", { id: pluginId, key, value });
        return true;
      }
      case "notify": {
        if (!this.has("notifications")) throw new BridgeFailure("permission-denied");
        const title = str(p.title, 80);
        const body = p.body === undefined ? "" : str(p.body, 200);
        if (!title || body === null) throw new BridgeFailure("bad-params");
        if (Date.now() - this.lastNotify < NOTIFY_MIN_GAP_MS) throw new BridgeFailure("rate-limited");
        this.lastNotify = Date.now();
        await invoke("push_notification_cmd", {
          title,
          body,
          appName: this.opts.manifest.name,
          category: "plugin",
        });
        return true;
      }
      case "apps.launch": {
        if (!this.has("launch-apps")) throw new BridgeFailure("permission-denied");
        const name = str(p.name, 120);
        if (!name) throw new BridgeFailure("bad-params");
        const app = (await installedApps()).find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!app) throw new BridgeFailure("bad-params");
        const grant = `launch:${app.path}`;
        if (!this.opts.grants().includes(grant)) {
          await invoke("request_plugin_approval_cmd", { id: pluginId, grant, label: `open ${app.name}` });
          this.opts.onApprovalRequested?.();
          throw new BridgeFailure("approval-required");
        }
        await invoke("plugin_launch_app_cmd", { id: pluginId, path: app.path });
        return true;
      }
      case "url.open": {
        if (!this.has("open-urls")) throw new BridgeFailure("permission-denied");
        const raw = str(p.url, 2000);
        let url: URL;
        try {
          url = new URL(raw ?? "");
        } catch {
          throw new BridgeFailure("bad-params");
        }
        if (url.protocol !== "https:" || url.username || url.password) throw new BridgeFailure("bad-params");
        const grant = `url:${url.origin}`;
        if (!this.opts.grants().includes(grant)) {
          await invoke("request_plugin_approval_cmd", { id: pluginId, grant, label: `open ${url.origin}` });
          this.opts.onApprovalRequested?.();
          throw new BridgeFailure("approval-required");
        }
        await invoke("plugin_open_url_cmd", { id: pluginId, url: url.href });
        return true;
      }
      default:
        throw new BridgeFailure("unknown-method");
    }
  }
}

class BridgeFailure extends Error {
  constructor(public code: BridgeError) {
    super(code);
  }
}

export { PLUGINS_CHANGED_EVENT };

/** How to load a plugin frame: `src` (a file served by the asset protocol — the normal case)
 *  or `srcDoc` (fallback when the backend can't write the file; such a frame inherits the Lens
 *  window's CSP, so plugin scripts won't run there and the slot shows the plugin as stopped). */
export interface PluginFrameSource {
  src?: string;
  srcDoc?: string;
}

/** Writes the composed document to %APPDATA%\LensUI\plugin-frames\<id>.html and returns an
 *  asset URL for it. Each call adds a cache-busting query so a reinstall shows the new file. */
export async function materializePluginDocument(id: string, doc: string): Promise<PluginFrameSource> {
  try {
    const path = await invoke<string>("write_plugin_frame_cmd", { id, html: doc });
    if (typeof path === "string" && path.length > 0) {
      return { src: `${convertFileSrc(path)}?v=${Date.now()}` };
    }
  } catch {
    // fall through
  }
  return { srcDoc: doc };
}
