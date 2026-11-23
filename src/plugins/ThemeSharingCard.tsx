import React, { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../types/lens";
import { exportLensTheme, importLensTheme } from "../themes/lenstheme";
import { applyThemeFileBackdrop } from "../studio/backdrop/apply";
import { parseGalleryIndex, type GalleryEntry, type GalleryIndex } from "./gallery";
import "./plugins.css";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const MAX_THEME_FILE = 256 * 1024;
const MAX_GALLERY_FILE = 8 * 1024 * 1024;

async function readText(file: File, max: number): Promise<string> {
  if (file.size > max) throw new Error("That file is too large.");
  return file.text();
}

/** Share looks as files: export to anywhere, import a .lenstheme someone sent you,
 *  and browse a theme gallery file (no network yet; only inline themes can be applied). */
export const ThemeSharingCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryIndex | null>(null);
  const themeInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const say = (s: string) => setStatus(s);
  const err = (e: unknown) => setStatus(e instanceof Error ? e.message : String(e));

  const exportToFile = async () => {
    const label = name.trim() || "My Lens theme";
    try {
      const json = JSON.stringify(exportLensTheme(config, label), null, 2);
      const path = await invoke<string | null>("save_lenstheme_dialog_cmd", { suggestedName: label, content: json });
      say(path ? `Saved to ${path}` : "Export cancelled.");
    } catch (e) {
      err(e);
    }
  };

  const applyTheme = async (raw: unknown, label: string, keep: boolean) => {
    const next = importLensTheme(config, raw);
    await onUpdateConfig(next);
    await applyThemeFileBackdrop(raw).catch(() => false);
    if (keep) {
      await invoke("save_theme_file_cmd", { name: label, json: JSON.stringify(raw) }).catch(() => {});
    }
  };

  const onThemeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw = JSON.parse(await readText(file, MAX_THEME_FILE));
      const label = typeof raw?.name === "string" && raw.name.trim() ? raw.name : file.name.replace(/\.[^.]+$/, "");
      await applyTheme(raw, label, true);
      say(`Applied "${label}" and added it to your saved themes.`);
    } catch (ex) {
      err(ex instanceof SyntaxError ? new Error("That file isn't a Lens theme.") : ex);
    }
  };

  const onGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const g = parseGalleryIndex(JSON.parse(await readText(file, MAX_GALLERY_FILE)));
      setGallery(g);
      say(`${g.themes.length} theme${g.themes.length === 1 ? "" : "s"} in "${g.name}".`);
    } catch (ex) {
      err(ex instanceof SyntaxError ? new Error("That file isn't a theme gallery.") : ex);
    }
  };

  const applyEntry = async (t: GalleryEntry) => {
    if (!t.theme) return;
    try {
      await applyTheme(t.theme, t.name, true);
      say(`Applied "${t.name}".`);
    } catch (e) {
      err(e);
    }
  };

  return (
    <div className="cc-card">
      <div className="cc-label">Share Themes</div>
      <div className="cc-desc">Export your current look to a .lenstheme file, or open one someone sent you.</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="cc-input"
          style={{ flex: "1 1 160px" }}
          placeholder="Theme name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          aria-label="Theme name"
        />
        <button type="button" className="cc-btn" onClick={exportToFile}>
          Export to file…
        </button>
        <button type="button" className="cc-btn-ghost" onClick={() => themeInput.current?.click()}>
          Import file…
        </button>
        <button type="button" className="cc-btn-ghost" onClick={() => galleryInput.current?.click()}>
          Open gallery…
        </button>
        <input ref={themeInput} type="file" accept=".lenstheme,.json" className="lens-visually-hidden" onChange={onThemeFile} aria-label="Choose a theme file" />
        <input ref={galleryInput} type="file" accept=".json" className="lens-visually-hidden" onChange={onGalleryFile} aria-label="Choose a gallery file" />
      </div>

      {gallery && (
        <div className="lens-gallery-grid">
          {gallery.themes.map((t) => (
            <div key={t.id} className="lens-gallery-item">
              <div
                className="lens-gallery-preview"
                style={t.preview ? { backgroundImage: `url("${t.preview}")` } : undefined}
                aria-hidden="true"
              />
              <div className="lens-pm-name">{t.name}</div>
              <div className="lens-pm-meta">{t.author || "Unknown author"}</div>
              {t.theme ? (
                <button type="button" className="cc-btn" onClick={() => applyEntry(t)}>
                  Apply
                </button>
              ) : (
                <div className="cc-desc">Download not available yet</div>
              )}
            </div>
          ))}
        </div>
      )}

      {status && (
        <div className="lens-pm-status" role="status">
          {status}
        </div>
      )}
    </div>
  );
};
