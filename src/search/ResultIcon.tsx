import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppWindow,
  Calculator,
  FileCode2,
  FileText,
  Folder,
  Globe,
  Image as ImageIcon,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Zap,
} from "lucide-react";
import type { SearchItem } from "./engine";

// ---- Icon cache shared by every result in this window; at most 4 extractions at once ----
const iconCache = new Map<string, string | null>();
const iconWaiters = new Map<string, ((url: string | null) => void)[]>();
const iconQueue: string[] = [];
let iconActive = 0;

function pump() {
  while (iconActive < 4 && iconQueue.length > 0) {
    const path = iconQueue.shift() as string;
    iconActive += 1;
    invoke<string | null>("get_icon_for_path", { path })
      .catch(() => null)
      .then((url) => {
        iconCache.set(path, url ?? null);
        (iconWaiters.get(path) ?? []).forEach((fn) => fn(url ?? null));
        iconWaiters.delete(path);
        iconActive -= 1;
        pump();
      });
  }
}

export function requestIcon(path: string, cb: (url: string | null) => void) {
  const cached = iconCache.get(path);
  if (cached !== undefined) {
    cb(cached);
    return;
  }
  const waiting = iconWaiters.get(path);
  if (waiting) {
    waiting.push(cb);
    return;
  }
  iconWaiters.set(path, [cb]);
  iconQueue.push(path);
  pump();
}

export function cachedIcon(path: string): string | null | undefined {
  return iconCache.get(path);
}

/** Full-color icon for a path, extracted only once it scrolls into view. */
export const LazyPathIcon: React.FC<{ path: string; size: number; fallback?: React.ReactNode; className?: string }> = ({
  path,
  size,
  fallback,
  className,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(() => iconCache.get(path) ?? null);

  useEffect(() => {
    let alive = true;
    const cached = iconCache.get(path);
    if (cached !== undefined) {
      setUrl(cached);
      return;
    }
    setUrl(null);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          requestIcon(path, (u) => {
            if (alive) setUrl(u);
          });
        }
      },
      { rootMargin: "160px" }
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [path]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      {url ? <img src={url} alt="" width={size} height={size} draggable={false} /> : fallback ?? <AppWindow size={Math.round(size * 0.85)} strokeWidth={2.1} />}
    </span>
  );
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp", "heic"];
const CODE_EXT = ["ts", "tsx", "js", "jsx", "rs", "py", "json", "css", "html", "md", "c", "cpp", "cs", "go", "java", "toml", "yaml", "yml"];

/** One icon vocabulary for every search result, in every surface. */
export const ResultIcon: React.FC<{ item: SearchItem; size?: number }> = ({ item, size = 17 }) => {
  const s = size;
  if (item.iconUrl) return <img src={item.iconUrl} alt="" width={s + 2} height={s + 2} draggable={false} />;
  switch (item.kind) {
    case "calc":
      return <Calculator size={s} strokeWidth={2.2} color="#F59E0B" />;
    case "shell":
      return <SquareTerminal size={s} strokeWidth={2.2} color="#38BDF8" />;
    case "web":
      return <Globe size={s} strokeWidth={2.2} color="#60A5FA" />;
    case "nl":
      return <Zap size={s} strokeWidth={2.2} color="#FBBF24" />;
    case "setting":
      return <Settings size={s} strokeWidth={2.2} color="var(--lens-fg-secondary)" />;
    case "action":
      return item.key.startsWith("lens:theme:") ? (
        <Sparkles size={s} strokeWidth={2.2} color="#A78BFA" />
      ) : (
        <SlidersHorizontal size={s} strokeWidth={2.2} color="var(--lens-fg)" />
      );
    case "script":
      return <SquareTerminal size={s} strokeWidth={2.2} color="#34D399" />;
    case "folder":
      return <Folder size={s} strokeWidth={2.2} color="#FBBF24" />;
    case "file": {
      const e = (item.ext || "").toLowerCase();
      if (IMAGE_EXT.includes(e)) return <ImageIcon size={s} strokeWidth={2.2} color="#34D399" />;
      if (CODE_EXT.includes(e)) return <FileCode2 size={s} strokeWidth={2.2} color="#60A5FA" />;
      return <FileText size={s} strokeWidth={2.2} color={e === "pdf" ? "#FB7185" : "#A78BFA"} />;
    }
    case "app":
    case "window":
    default:
      return item.path ? (
        <LazyPathIcon path={item.path} size={s + 2} fallback={<AppWindow size={s} strokeWidth={2.2} color="#A78BFA" />} />
      ) : (
        <AppWindow size={s} strokeWidth={2.2} color="#38BDF8" />
      );
  }
};

export function resultBadge(item: SearchItem): string {
  if (item.badge) return item.badge;
  switch (item.kind) {
    case "window":
      return "Open";
    case "app":
      return "App";
    case "setting":
      return "Settings";
    case "action":
      return "Lens";
    case "script":
      return "Script";
    case "folder":
      return "Folder";
    case "file":
      return "File";
    default:
      return "";
  }
}
