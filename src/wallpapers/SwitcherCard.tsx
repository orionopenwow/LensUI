/**
 * Settings › Appearance › Wallpaper: the Wallpaper Switcher's card. Simple mode shows the picker
 * button and "Change automatically"; everything else is in the full card and in the picker.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "../ui";
import { vars } from "../studio/backdrop/ui/vars";
import type { LibraryView, SwitcherSettings } from "../types/generated";
import { wallpapersApi } from "./api";
import { AutoChangeControls } from "./AutoChangeControls";
import { autoSummary, fileCard, sourceOptions } from "./model";
import { openWallpaperPicker } from "./open";
import { runWallpaperAction } from "./command";
import "./wallpapers.css";

const TILTS = [
  ["-9deg", "4px"],
  ["-3deg", "0px"],
  ["4deg", "1px"],
  ["10deg", "5px"],
];

export const SwitcherCard: React.FC<{ simple?: boolean }> = ({ simple }) => {
  const [view, setView] = useState<LibraryView | null>(null);
  const load = useCallback(() => {
    wallpapersApi.library().then(setView).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const un = listen("lens://wallpapers-settings", load);
    return () => {
      un.then((f) => f());
    };
  }, [load]);

  const cards = useMemo(() => (view?.items ?? []).map(fileCard), [view]);
  const sources = useMemo(() => sourceOptions(view?.settings ?? null, cards), [view, cards]);
  const save = (next: SwitcherSettings) => {
    setView((v) => (v ? { ...v, settings: next } : v));
    wallpapersApi
      .saveSettings(next)
      .then(setView)
      .catch((e) => toast.error(typeof e === "string" ? e : "That could not be saved."));
  };
  const count = cards.filter((c) => !c.meta.hidden).length;
  const arts = cards.filter((c) => c.meta.palette.length).slice(0, 4);
  const step = (action: "next" | "prev" | "random") => runWallpaperAction(action).then((line) => (line.startsWith("Showing") ? toast.success(line) : toast(line)));

  return (
    <div className="wsc" data-wallpaper-switcher data-guide-id="wallpaper-switcher">
      <button data-weight="medium" type="button" className="wsc-open" data-open-picker onClick={openWallpaperPicker}>
        <span>
          Open the wallpaper picker
          <small>{count ? `${count} in your library, plus Lens' own living wallpapers` : "Add a folder, or pick one of Lens' own living wallpapers"}</small>
        </span>
        <span className="wsc-fan" aria-hidden>
          {TILTS.map(([tilt, lift], i) => (
            <i key={i} ref={vars<HTMLElement>({ "--tilt": tilt, "--lift": lift, "--art": arts[i]?.art })} />
          ))}
        </span>
      </button>
      {view && <AutoChangeControls settings={view.settings} sources={sources} simple={simple} onChange={save} />}
      {!simple && view && (
        <>
          <div className="wsc-quick">
            <button data-weight="medium" type="button" className="lens-btn is-sm" onClick={() => step("next")} disabled={!count}>
              Next
            </button>
            <button data-weight="medium" type="button" className="lens-btn is-sm" onClick={() => step("prev")} disabled={!count}>
              Previous
            </button>
            <button data-weight="medium" type="button" className="lens-btn is-sm" onClick={() => step("random")} disabled={!count}>
              Random
            </button>
          </div>
          <p className="wsc-note">
            {autoSummary(view.settings.auto)}. Folders, favourites, tags, collections and look-alikes are in the picker. Your Windows wallpaper is never changed: Lens shows the picture you pick behind
            your icons, and turning Lens Wallpaper off brings your own back. Type /wallpaper next in Lens Command, or say "next wallpaper".
          </p>
        </>
      )}
    </div>
  );
};
