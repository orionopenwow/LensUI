import React, { useCallback, useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Image as ImageIcon, Film, Code2, FolderOpen, Droplets, Sun, Contrast, Pipette } from "lucide-react";
import type { LensConfig } from "../types/lens";
import { PillFillBar } from "./PillFillBar";
import { accentFromUrl } from "../themes/accentFromImage";
import type { WallpaperFile, WallpaperSettings, WallpaperState } from "../surfaces/wallpaperTypes";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const FITS: { id: string; label: string }[] = [
  { id: "cover", label: "Fill" },
  { id: "contain", label: "Fit" },
  { id: "fill", label: "Stretch" },
  { id: "center", label: "Center" },
];

function KindIcon({ kind }: { kind: WallpaperFile["kind"] }) {
  if (kind === "video") return <Film size={18} strokeWidth={2.2} />;
  if (kind === "html") return <Code2 size={18} strokeWidth={2.2} />;
  return <ImageIcon size={18} strokeWidth={2.2} />;
}

/** Control Center card: Lens wallpaper behind the icons, plus accent-from-wallpaper. */
export const WallpaperCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const [state, setState] = useState<WallpaperState | null>(null);
  const [files, setFiles] = useState<WallpaperFile[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    invoke<WallpaperState>("get_wallpaper_state_cmd").then(setState).catch(() => {});
    invoke<WallpaperFile[]>("list_wallpapers_cmd").then(setFiles).catch(() => setFiles([]));
  }, []);

  useEffect(() => {
    refresh();
    const un = listen("lens://wallpaper-changed", () => refresh());
    return () => {
      un.then((f) => f());
    };
  }, [refresh]);

  const save = async (patch: Partial<WallpaperSettings>) => {
    if (!state) return;
    const next = { ...state.settings, ...patch };
    setState({ ...state, settings: next });
    try {
      const res = await invoke<WallpaperState>("set_wallpaper_settings_cmd", { settings: next });
      if (res) setState(res);
      setStatus(null);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const applyAccent = (hex: string) => {
    onUpdateConfig({ ...config, theme: { ...config.theme, accentMode: "custom", customAccent: hex } });
    setStatus(`Accent set to ${hex}.`);
  };

  const accentFromWindowsWallpaper = async () => {
    setBusy(true);
    try {
      const path = await invoke<string | null>("snapshot_windows_wallpaper_cmd");
      if (!path) {
        setStatus("Couldn't read your Windows wallpaper.");
        return;
      }
      const res = await accentFromUrl(convertFileSrc(path));
      if (!res) {
        setStatus("Your wallpaper is mostly black, white or grey, so there is no clear accent in it.");
        return;
      }
      applyAccent(res.accent);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const s = state.settings;
  const measured = s.accentHex;

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Lens Wallpaper</div>
          <div className="cc-desc">
            Image, looping video or HTML wallpaper drawn behind your desktop icons. Your Windows wallpaper
            is never changed and comes back as soon as this is off.
          </div>
        </div>
        <button
          type="button"
          className={`cc-toggle ${s.enabled ? "on" : ""}`}
          aria-label="Lens wallpaper"
          onClick={() => save({ enabled: !s.enabled })}
        />
      </div>

      <div className="cc-label" style={{ marginTop: 2 }}>
        Wallpapers
      </div>
      {files.length === 0 ? (
        <div className="cc-desc">
          Drop .jpg, .png, .webp, .mp4, .webm or .html files into the wallpapers folder, then press Refresh.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 8 }}>
          {files.map((f) => {
            const active = f.name === s.file;
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => save({ file: f.name })}
                aria-pressed={active}
                style={{
                  position: "relative",
                  height: 70,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: active ? "2px solid var(--lens-fg)" : "1px solid var(--lens-border)",
                  background: "rgb(var(--lens-ink) / 0.05)",
                  color: "var(--lens-fg-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {f.kind === "image" ? (
                  <img
                    src={convertFileSrc(f.path)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <KindIcon kind={f.kind} />
                )}
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: "3px 6px",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "#fafafa",
                    background: "linear-gradient(transparent, rgb(0 0 0 / 0.72))",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textAlign: "left",
                  }}
                >
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="cc-btn-ghost" onClick={refresh}>
          Refresh
        </button>
        <button
          type="button"
          className="cc-btn-ghost"
          onClick={() => invoke("open_wallpapers_folder_cmd").catch(() => {})}
        >
          <FolderOpen size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
          Open Folder
        </button>
      </div>

      <div className="cc-row">
        <div className="cc-label">Fit</div>
        <div className="cc-chip-grid">
          {FITS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cc-chip ${s.fit === f.id ? "active" : ""}`}
              onClick={() => save({ fit: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <PillFillBar
        label="Blur"
        value={s.blur}
        min={0}
        max={40}
        step={1}
        unit="px"
        fillColor="#60A5FA"
        icon={<Droplets size={14} strokeWidth={2.3} />}
        onChange={(v) => save({ blur: v })}
      />
      <PillFillBar
        label="Dim"
        value={s.dim}
        min={0}
        max={80}
        step={2}
        fillColor="#A1A1AA"
        icon={<Sun size={14} strokeWidth={2.3} />}
        onChange={(v) => save({ dim: v })}
      />
      <PillFillBar
        label="Saturation"
        value={s.saturation}
        min={0}
        max={200}
        step={5}
        fillColor="#34D399"
        icon={<Contrast size={14} strokeWidth={2.3} />}
        onChange={(v) => save({ saturation: v })}
      />

      <div className="cc-row">
        <div>
          <div className="cc-label">Pause when a window fills the screen</div>
          <div className="cc-desc">Stops video and HTML wallpapers while you can't see them.</div>
        </div>
        <button
          type="button"
          className={`cc-toggle ${s.pauseWhenCovered ? "on" : ""}`}
          aria-label="Pause when covered"
          onClick={() => save({ pauseWhenCovered: !s.pauseWhenCovered })}
        />
      </div>
      <div className="cc-row">
        <div>
          <div className="cc-label">Pause on battery</div>
          <div className="cc-desc">Saves power when unplugged.</div>
        </div>
        <button
          type="button"
          className={`cc-toggle ${s.pauseOnBattery ? "on" : ""}`}
          aria-label="Pause on battery"
          onClick={() => save({ pauseOnBattery: !s.pauseOnBattery })}
        />
      </div>

      <div className="cc-row">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              flexShrink: 0,
              background: measured || "transparent",
              border: "1px solid rgb(var(--lens-ink) / 0.22)",
            }}
          />
          <div>
            <div className="cc-label">Wallpaper accent</div>
            <div className="cc-desc">
              {measured
                ? `${measured}, taken from the Lens wallpaper.`
                : "Shown once a Lens wallpaper has been displayed."}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="cc-btn"
            disabled={!measured}
            style={{ opacity: measured ? 1 : 0.4, cursor: measured ? "pointer" : "default" }}
            onClick={() => measured && applyAccent(measured)}
          >
            Use Accent
          </button>
        </div>
      </div>
      <div className="cc-row">
        <div>
          <div className="cc-label">Follow wallpaper accent</div>
          <div className="cc-desc">Re-colour Lens automatically whenever the Lens wallpaper changes.</div>
        </div>
        <button
          type="button"
          className={`cc-toggle ${s.followAccent ? "on" : ""}`}
          aria-label="Follow wallpaper accent"
          onClick={() => save({ followAccent: !s.followAccent })}
        />
      </div>
      <div className="cc-row">
        <div>
          <div className="cc-label">Accent from my Windows wallpaper</div>
          <div className="cc-desc">Works without the Lens wallpaper: samples the picture Windows is showing.</div>
        </div>
        <button
          type="button"
          className="cc-btn-ghost"
          disabled={busy}
          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
          onClick={accentFromWindowsWallpaper}
        >
          <Pipette size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
          {busy ? "Reading…" : "Pick Accent"}
        </button>
      </div>

      {status && <div className="cc-desc">{status}</div>}
    </div>
  );
};
