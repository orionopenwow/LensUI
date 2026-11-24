// Where a safety check fires, the surface that started the work shows it: this mounts the
// SafetyBanner for `lens://agentsafe/flag` events (the gate found something in attached text,
// or made a step wait or refused it). Drawn in Lens chrome, never inside page content.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SafetyReason } from "./contract";
import { SafetyBanner } from "./SafetyBanner";

/** `ai::SafetyFlagEvent`. */
export interface SafetyFlag {
  /** The request, tab or snip it belongs to ("" when there is none). */
  id: string;
  /** "context" | "step" | "control" | "browser" | "snip" */
  source: string;
  /** What it is about: "page text", "clipboard", a site, or the step's summary. */
  label: string;
  /** "ask" | "block" */
  verdict: string;
  /** Spans set aside before any model saw the text. */
  setAside: number;
  reasons: SafetyReason[];
}

export const SAFETY_FLAG_EVENT = "lens://agentsafe/flag";

/** Pure: is this payload a flag worth showing to a surface that listens for `sources`? */
export function acceptFlag(payload: unknown, sources: readonly string[]): SafetyFlag | null {
  const p = payload as Partial<SafetyFlag> | null;
  if (!p || typeof p !== "object" || typeof p.source !== "string" || !sources.includes(p.source)) return null;
  const reasons = Array.isArray(p.reasons) ? p.reasons.filter((r) => r && typeof r.detail === "string" && r.detail) : [];
  const setAside = Number(p.setAside) > 0 ? Math.floor(Number(p.setAside)) : 0;
  if (!reasons.length && !setAside) return null;
  return {
    id: typeof p.id === "string" ? p.id : "",
    source: p.source,
    label: typeof p.label === "string" && p.label.trim() ? p.label.trim().slice(0, 120) : "this content",
    verdict: p.verdict === "block" ? "block" : "ask",
    setAside,
    reasons,
  };
}

/** Pure: the banner's headline for a flag. */
export function flagTitle(f: Pick<SafetyFlag, "source" | "verdict" | "setAside">): string {
  if (f.setAside > 0) return "Lens set aside text the AI shouldn't follow";
  if (f.verdict === "block") return f.source === "context" || f.source === "snip" ? "This text tries to instruct the AI" : "Lens stopped a step";
  return "Lens is checking with you first";
}

/** Pure: newest first, one banner per (source, label), at most `max`. */
export function mergeFlags(list: SafetyFlag[], next: SafetyFlag, max = 3): SafetyFlag[] {
  return [next, ...list.filter((f) => !(f.source === next.source && f.label === next.label))].slice(0, max);
}

/** Live flags for the given sources, newest first. */
export function useSafetyFlags(sources: readonly string[]): { flags: SafetyFlag[]; dismiss: (f: SafetyFlag) => void } {
  const [flags, setFlags] = useState<SafetyFlag[]>([]);
  const key = sources.join(",");
  useEffect(() => {
    const un = listen<unknown>(SAFETY_FLAG_EVENT, (e) => {
      const flag = acceptFlag(e.payload, key.split(","));
      if (flag) setFlags((list) => mergeFlags(list, flag));
    });
    un.catch(() => undefined);
    return () => {
      un.then((f) => f()).catch(() => undefined);
    };
  }, [key]);
  return { flags, dismiss: (f) => setFlags((list) => list.filter((x) => x !== f)) };
}

/** The banners themselves. Mount once per surface, near the top of its content. */
export const SafetyFlagBanners: React.FC<{ sources: readonly string[]; className?: string }> = ({ sources, className }) => {
  const { flags, dismiss } = useSafetyFlags(sources);
  if (!flags.length) return null;
  return (
    <div className={className ?? "as-flags"} data-testid="safety-flags">
      {flags.map((f) => (
        <SafetyBanner
          key={`${f.source}:${f.label}`}
          site={f.label}
          title={flagTitle(f)}
          reasons={f.reasons}
          setAside={f.setAside}
          onContinue={() => dismiss(f)}
          onShowSetAside={f.setAside > 0 ? () => void invoke("open_surface", { label: "settings" }).catch(() => undefined) : undefined}
        />
      ))}
    </div>
  );
};

export default SafetyFlagBanners;
