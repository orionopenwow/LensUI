/**
 * Backdrop exports: PNG stills (offscreen, up to 4K), seamless video loops (WebM, MP4 where the
 * WebView supports it) and the share card. Frames are rendered at exact loop times, so a loop
 * export of `loop` seconds plays seamlessly on repeat.
 */
import { BackdropRenderer, exportFrameTimes, shareLink, type BackdropState } from "./engine";

export interface Size {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const SIZES: Size[] = [
  { id: "480p", label: "480p", w: 854, h: 480 },
  { id: "720p", label: "720p", w: 1280, h: 720 },
  { id: "1080p", label: "1080p", w: 1920, h: 1080 },
  { id: "1440p", label: "1440p", w: 2560, h: 1440 },
  { id: "4k", label: "4K", w: 3840, h: 2160 },
  { id: "square", label: "Square", w: 2048, h: 2048 },
  { id: "phone", label: "Phone", w: 1080, h: 2340 },
  { id: "dual", label: "Two monitors", w: 3840, h: 1080 },
  { id: "ultrawide", label: "Ultrawide", w: 3440, h: 1440 },
];

export function sizeById(id: string): Size {
  return SIZES.find((s) => s.id === id) ?? SIZES[2];
}

function offscreen(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** One still frame as a PNG data URL. */
export function renderPng(s: BackdropState, w: number, h: number, time = 4): string {
  const c = offscreen(w, h);
  const r = new BackdropRenderer(c, { preserve: true });
  try {
    r.replace(s);
    r.render(time);
    return c.toDataURL("image/png");
  } finally {
    r.dispose();
  }
}

export type VideoFormat = "webm" | "mp4";

export function videoMime(format: VideoFormat): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const list =
    format === "mp4"
      ? ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4"]
      : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export interface VideoJob {
  /** 0..1 */
  progress: number;
  etaSeconds: number;
}

/**
 * Records `seconds` of the backdrop (a whole number of loops makes a seamless loop file).
 * Frames are rendered at exact times i/fps and handed to the encoder at real-time pace.
 */
export async function recordVideo(
  s: BackdropState,
  opts: { w: number; h: number; seconds: number; fps: number; format: VideoFormat; bitrate?: number },
  onProgress: (j: VideoJob) => void,
  signal: AbortSignal
): Promise<Blob> {
  const mime = videoMime(opts.format);
  if (!mime) throw new Error(opts.format === "mp4" ? "MP4 recording isn't available in this version of Windows' web view. Choose WebM." : "Video recording isn't available here.");
  const c = offscreen(opts.w, opts.h);
  const r = new BackdropRenderer(c, { preserve: true });
  r.replace(s);
  r.render(0);
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrate ?? Math.round(opts.w * opts.h * opts.fps * 0.12) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => (signal.aborted ? reject(new DOMException("Cancelled", "AbortError")) : resolve(new Blob(chunks, { type: mime.split(";")[0] })));
    rec.onerror = () => reject(new Error("The recorder stopped unexpectedly."));
  });
  rec.start(1000);
  const times = exportFrameTimes(opts.seconds, opts.fps);
  const started = performance.now();
  try {
    for (let i = 0; i < times.length; i++) {
      if (signal.aborted) break;
      r.render(times[i]);
      track.requestFrame?.();
      const due = started + ((i + 1) * 1000) / opts.fps;
      const wait = due - performance.now();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      if (i % 5 === 0) {
        const p = (i + 1) / times.length;
        onProgress({ progress: p, etaSeconds: Math.max(0, Math.round(((performance.now() - started) / 1000 / p) * (1 - p))) });
      }
    }
  } finally {
    rec.stop();
    track.stop();
    r.dispose();
  }
  onProgress({ progress: 1, etaSeconds: 0 });
  return done;
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split("base64,")[1] ?? "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}

/** 1200×630 share card: the backdrop, its name and its share link. */
export async function shareCard(s: BackdropState): Promise<string> {
  const W = 1200;
  const H = 630;
  const img = new Image();
  img.src = renderPng(s, W, H);
  await img.decode().catch(() => {});
  const c = offscreen(W, H);
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, W, H);
  const grad = g.createLinearGradient(0, H * 0.55, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.6)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#FAFAFA";
  g.font = "600 44px 'Segoe UI', Arial, sans-serif";
  g.fillText(s.name || "Backdrop", 56, H - 104);
  g.font = "500 20px 'Segoe UI', Arial, sans-serif";
  g.fillStyle = "rgba(250,250,250,0.8)";
  g.fillText("Made in Lens Backdrop Lab · open the link in Lens to use it", 56, H - 66);
  g.font = "13px Consolas, monospace";
  g.fillStyle = "rgba(250,250,250,0.55)";
  const link = shareLink(s);
  g.fillText(link.length > 150 ? link.slice(0, 147) + "…" : link, 56, H - 36);
  return c.toDataURL("image/png");
}
