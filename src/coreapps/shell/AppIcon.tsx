import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, Promise<string | null>>();

/** The real icon of an exe (the Dock's icon extractor, cached), or the app's initial. */
export const AppIcon: React.FC<{ exe?: string | null; name: string }> = ({ exe, name }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!exe) return;
    if (!cache.has(exe)) cache.set(exe, invoke<string | null>("get_icon_for_path", { path: exe }).catch(() => null));
    cache.get(exe)!.then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [exe]);
  return <span className="ca-item-icon" aria-hidden>{src ? <img src={src} alt="" /> : (name.trim()[0] ?? "?").toUpperCase()}</span>;
};
