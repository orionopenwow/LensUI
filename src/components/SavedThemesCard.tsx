import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../types/lens";
import { exportLensTheme, exportLensThemeAsCustomPack, importLensTheme } from "../themes/lenstheme";
import { applyThemeFileBackdrop } from "../studio/backdrop/apply";

interface ThemeFileInfo {
  name: string;
  path: string;
}

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

/** Save the current look as a `.lenstheme` file, and apply, share or remove saved ones. */
export const SavedThemesCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const [files, setFiles] = useState<ThemeFileInfo[]>([]);
  const [name, setName] = useState("");
  // Optional: a surface color of the user's own turns the saved look into a custom pack.
  const [surface, setSurface] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<ThemeFileInfo[]>("list_theme_files_cmd")
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  useEffect(refresh, [refresh]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const base = surface.trim();
    if (base && !/^#[0-9a-fA-F]{6}$/.test(base)) {
      setStatus("Surface color must look like #1A1B26.");
      return;
    }
    try {
      const file = base
        ? exportLensThemeAsCustomPack(config, trimmed, { label: trimmed, base })
        : exportLensTheme(config, trimmed);
      await invoke("save_theme_file_cmd", { name: trimmed, json: JSON.stringify(file) });
      setStatus(base ? `Saved "${trimmed}" as your own pack. Press Apply to use it.` : `Saved "${trimmed}".`);
      setName("");
      setSurface("");
      refresh();
    } catch (e) {
      setStatus(`Couldn't save: ${String(e)}`);
    }
  };

  const apply = async (file: ThemeFileInfo) => {
    try {
      const raw = await invoke<string>("read_theme_file_cmd", { name: file.name });
      const parsed = JSON.parse(raw);
      await onUpdateConfig(importLensTheme(config, parsed));
      const live = await applyThemeFileBackdrop(parsed).catch(() => false);
      setStatus(live ? `Applied "${file.name}" with its live backdrop.` : `Applied "${file.name}".`);
    } catch (e) {
      setStatus(`Couldn't apply "${file.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (file: ThemeFileInfo) => {
    try {
      await invoke("delete_theme_file_cmd", { name: file.name });
      setStatus(`Removed "${file.name}".`);
      refresh();
    } catch (e) {
      setStatus(`Couldn't remove: ${String(e)}`);
    }
  };

  return (
    <div className="cc-card">
      <div className="cc-label">Saved Themes</div>
      <div className="cc-desc">
        Save your current look as a .lenstheme file. Add a surface color to make it a pack of your own.
        To use someone else's theme, drop their file into the themes folder and press Refresh.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          className="cc-input"
          style={{ flex: "1 1 160px", minWidth: 0 }}
          placeholder="Name this look"
          aria-label="Name this look"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <input
          className="cc-input"
          style={{ width: 118 }}
          placeholder="Surface #hex"
          aria-label="Optional surface color for a pack of your own"
          value={surface}
          maxLength={7}
          onChange={(e) => setSurface(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <button type="button" className="cc-btn" onClick={save}>
          Save
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="cc-btn-ghost" onClick={refresh}>
          Refresh
        </button>
        <button
          type="button"
          className="cc-btn-ghost"
          onClick={() => invoke("open_themes_folder_cmd").catch(() => {})}
        >
          Open Folder
        </button>
      </div>

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f) => (
            <div key={f.path} className="cc-row" style={{ padding: "6px 0" }}>
              <span className="cc-label">{f.name}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cc-btn" onClick={() => apply(f)}>
                  Apply
                </button>
                <button type="button" className="cc-btn-ghost" onClick={() => remove(f)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {status && <div className="cc-desc">{status}</div>}
    </div>
  );
};
