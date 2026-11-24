/**
 * Makes the 256 px thumbnail, the five-colour palette and the look-alike hash for a picture.
 * The webview already decodes every format the wallpaper host can show, so the work happens
 * here; Rust hands over the original (only from a watched folder) and stores what comes back.
 */
import type { ItemMeta, Original } from "../types/generated";
import { wallpapersApi } from "./api";
import { dHash, grayFromRgba, paletteFromRgba, type Card } from "./model";

export const THUMB_PX = 256;

export function originalBlob(o: Original): Blob {
  const bin = atob(o.dataB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: o.mime });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No canvas");
  return [c, ctx];
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface Measured {
  thumbDataUrl: string;
  width: number;
  height: number;
  palette: string[];
  phash: string;
}

/** Thumbnail (long edge 256 px, WebP), palette and hash for one decoded picture. */
export async function measure(blob: Blob): Promise<Measured> {
  const bmp = await createImageBitmap(blob);
  try {
    const k = THUMB_PX / Math.max(bmp.width, bmp.height, 1);
    const [tc, tctx] = canvas(Math.max(1, Math.round(bmp.width * Math.min(1, k))), Math.max(1, Math.round(bmp.height * Math.min(1, k))));
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(bmp, 0, 0, tc.width, tc.height);
    const thumb = await new Promise<Blob>((resolve, reject) => tc.toBlob((b) => (b ? resolve(b) : reject(new Error("No thumbnail"))), "image/webp", 0.82));
    const [, pctx] = canvas(32, 32);
    pctx.drawImage(tc, 0, 0, 32, 32);
    const [, hctx] = canvas(9, 8);
    hctx.drawImage(tc, 0, 0, 9, 8);
    return {
      thumbDataUrl: await dataUrl(thumb),
      width: bmp.width,
      height: bmp.height,
      palette: paletteFromRgba(pctx.getImageData(0, 0, 32, 32).data),
      phash: dHash(grayFromRgba(hctx.getImageData(0, 0, 9, 8).data)),
    };
  } finally {
    bmp.close();
  }
}

export interface Indexed {
  id: string;
  thumb: string;
  meta: ItemMeta;
}

/** Indexes one picture and stores the result. Resolves to null for anything that has no preview. */
export async function indexCard(card: Card): Promise<Indexed | null> {
  if (card.kind !== "image" || !card.item) return null;
  const original = await wallpapersApi.read(card.id);
  const m = await measure(originalBlob(original));
  const meta: ItemMeta = { ...card.meta, width: m.width, height: m.height, palette: m.palette, phash: m.phash, thumbed: true };
  const thumb = await wallpapersApi.saveThumb(card.id, m.thumbDataUrl, meta);
  return { id: card.id, thumb, meta };
}

/**
 * Works through the pictures that have no thumbnail yet, one at a time and nearest the focus
 * first, yielding between each so the picker stays smooth. Returns a function that stops it.
 */
export function indexMissing(cards: Card[], focus: () => number, onDone: (r: Indexed) => void, onProgress?: (left: number) => void): () => void {
  let stopped = false;
  const failed = new Set<string>();
  const todo = () => cards.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === "image" && !c.meta.thumbed && !failed.has(c.id));
  const run = async () => {
    for (;;) {
      if (stopped) return;
      const left = todo();
      onProgress?.(left.length);
      if (!left.length) return;
      const at = focus();
      left.sort((a, b) => Math.abs(a.i - at) - Math.abs(b.i - at));
      const { c } = left[0];
      try {
        const r = await indexCard(c);
        if (stopped) return;
        if (r) {
          // In place: the picker keeps one card object per file for as long as the library is open.
          c.meta = r.meta;
          c.thumb = r.thumb;
          if (c.item) {
            c.item.meta = r.meta;
            c.item.thumb = r.thumb;
          }
          onDone(r);
        } else failed.add(c.id);
      } catch {
        failed.add(c.id);
      }
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  };
  run();
  return () => {
    stopped = true;
  };
}
