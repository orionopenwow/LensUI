/** Export sheet: image, seamless video loop and share. Progress shows time remaining and can be cancelled. */
import React, { useRef, useState } from "react";
import { vars } from "./vars";
import { Button } from "../../../ui";
import { invoke } from "@tauri-apps/api/core";
import { Download, FolderOpen, X } from "lucide-react";
import { cssGradient, shareLink, toLensBg, type BackdropState } from "../engine";
import { SIZES, blobToBase64, recordVideo, renderPng, shareCard, sizeById, videoMime, type VideoFormat } from "../exporter";
import { Segmented } from "./controls";

type Kind = "image" | "video" | "share";

export const ExportSheet: React.FC<{ state: BackdropState; onClose: () => void; onToast: (t: string) => void }> = ({ state, onClose, onToast }) => {
  const [kind, setKind] = useState<Kind>("image");
  const [size, setSize] = useState("1080p");
  const [format, setFormat] = useState<VideoFormat>("webm");
  const [loops, setLoops] = useState(1);
  const [busy, setBusy] = useState<{ p: number; eta: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sz = sizeById(size);
  const seconds = Math.min(30, state.loop * loops);
  const name = state.name || "Backdrop";

  const save = async (ext: string, data: string) => {
    const path = await invoke<string>("studio_save_export", { name, ext, data });
    onToast(`Saved to ${path}`);
  };

  const run = async () => {
    setErr(null);
    try {
      if (kind === "image") {
        setBusy({ p: 0.5, eta: 1 });
        await new Promise((r) => setTimeout(r, 30));
        await save("png", renderPng(state, sz.w, sz.h));
      } else if (kind === "video") {
        abort.current = new AbortController();
        setBusy({ p: 0, eta: seconds });
        const blob = await recordVideo(state, { w: sz.w, h: sz.h, seconds, fps: 30, format }, (j) => setBusy({ p: j.progress, eta: j.etaSeconds }), abort.current.signal);
        await save(format, await blobToBase64(blob));
      }
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(`${what} copied`);
    } catch {
      setErr("Couldn't use the clipboard.");
    }
  };

  return (
    <div className="bd-sheet-backdrop" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bd-sheet" role="dialog" aria-modal="true" aria-label="Export">
        <div className="bd-sheet-head">
          <b>Export</b>
          <button type="button" className="bd-icon-btn" aria-label="Close" onClick={onClose} disabled={!!busy}>
            <X size={14} aria-hidden />
          </button>
        </div>
        <Segmented label="Export type" value={kind} options={[{ id: "image", label: "Image" }, { id: "video", label: "Video loop" }, { id: "share", label: "Share" }]} onChange={setKind} />
        {kind !== "share" && (
          <>
            <div className="bd-field-label">Size</div>
            <div className="bd-size-grid" role="radiogroup" aria-label="Size">
              {SIZES.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={size === s.id} className={size === s.id ? "on" : ""} onClick={() => setSize(s.id)}>
                  <b>{s.label}</b>
                  <small>
                    {s.w}×{s.h}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
        {kind === "video" && (
          <>
            <div className="bd-field-label">Format</div>
            <Segmented
              label="Format"
              value={format}
              options={[
                { id: "webm", label: "WebM" },
                { id: "mp4", label: videoMime("mp4") ? "MP4" : "MP4 (unavailable)" },
              ]}
              onChange={setFormat}
            />
            <div className="bd-field-label">Length</div>
            <Segmented
              label="Length"
              value={String(loops)}
              options={[1, 2, 3].filter((n) => state.loop * n <= 30).map((n) => ({ id: String(n), label: `${state.loop * n} s` }))}
              onChange={(v) => setLoops(Number(v))}
            />
            <p className="bd-hint">Whole loops, so the file repeats seamlessly. Recording runs in real time.</p>
          </>
        )}
        {kind === "share" && (
          <div className="bd-share">
            <Button size="sm" className="bd-b" onClick={() => copy(shareLink(state), "Link")}>
              Copy Lens link
            </Button>
            <Button size="sm" className="bd-b" onClick={() => save("lensbg", btoa(unescape(encodeURIComponent(toLensBg(state))))).catch((e) => setErr(String(e)))}>
              Save .lensbg file
            </Button>
            <Button size="sm" className="bd-b" onClick={() => shareCard(state).then((png) => save("png", png)).catch((e) => setErr(String(e)))}>
              Save share card
            </Button>
            <Button size="sm" className="bd-b" onClick={() => copy(`background: ${cssGradient(state)};`, "CSS")}>
              Copy CSS fallback
            </Button>
            <p className="bd-hint">Links and files hold only the settings (well under 1 KB). Nothing is uploaded.</p>
          </div>
        )}
        {err && (
          <p className="bd-err" role="alert">
            {err}
          </p>
        )}
        {busy ? (
          <div className="bd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(busy.p * 100)}>
            <div className="bd-progress-bar bd-v-w" ref={vars({ "--bd-w": `${Math.round(busy.p * 100)}%` })} />
            <span>
              {Math.round(busy.p * 100)}% · about {busy.eta}s left
            </span>
            {kind === "video" && (
              <Button size="sm" className="bd-b" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            )}
          </div>
        ) : (
          kind !== "share" && (
            <div className="bd-row end">
              <Button size="sm" variant="ghost" className="bd-b" onClick={() => invoke("studio_open_exports_folder").catch(() => {})}>
                <FolderOpen size={13} aria-hidden /> Open folder
              </Button>
              <Button size="sm" variant="primary" className="bd-b" onClick={run}>
                <Download size={13} aria-hidden /> Export {kind === "image" ? "PNG" : format.toUpperCase()}
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  );
};
