// The selection bubble: a small Lens dot shown just past the end of a text selection (opt-in).
// Click it to open Lens Mini with the selection as context; it fades on its own after 3 s.
// Window label: "bubble" (32×32, transparent, never takes focus until clicked).
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sparkles } from "lucide-react";
import { useLensState } from "../../hooks/useLensState";
import "./bubble.css";

export const BUBBLE_MS = 3000;

export function BubbleSurface({ initial }: { initial?: { chars: number } } = {}) {
  useLensState();
  const [shown, setShown] = useState<{ chars: number; n: number } | null>(initial ? { chars: initial.chars, n: 0 } : null);

  useEffect(() => {
    const un = listen<{ chars: number }>("lens://selection/bubble", (e) => setShown((s) => ({ chars: e.payload?.chars ?? 0, n: (s?.n ?? 0) + 1 })));
    return () => {
      un.then((u) => u()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!shown || initial) return;
    const t = window.setTimeout(() => {
      setShown(null);
      getCurrentWindow().hide().catch(() => {});
    }, BUBBLE_MS);
    return () => window.clearTimeout(t);
  }, [shown?.n]);

  if (!shown) return null;
  return (
    <button
      key={shown.n}
      type="button"
      className={`bubble${initial ? " is-still" : ""}`}
      aria-label={`Ask Lens about the ${shown.chars.toLocaleString()} selected characters`}
      onClick={async () => {
        await getCurrentWindow().hide().catch(() => {});
        await invoke("open_surface", { label: "command" }).catch(() => {});
        await emit("lens://command/open", { layout: "mini", anchor: "cursor" });
      }}
    >
      <Sparkles size={14} strokeWidth={2.4} />
    </button>
  );
}

export default BubbleSurface;
