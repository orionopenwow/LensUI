// Lens Clipboard: a standalone window over the existing clipboard history: pins, search,
// copy and paste-as (plain, markdown, trimmed), send to the Shelf.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipStatus, ClipView, LensConfig, PasteAs } from "../../types/generated";
import { AppShell, isKey } from "../shell/AppShell";
import { Button, Card, Empty, ErrorNote, Hero, Pill, Search, Skeleton, Tabs, Toast, cx } from "../shell/ui";
import { useLoad } from "../shell/hooks";
import { ago, plural } from "../shell/format";
import { KIND_LABEL, filterClips, groupClips, type ClipFilter } from "../models/clipboard";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

const PASTE_AS: { id: PasteAs; label: string }[] = [
  { id: "original", label: "As copied" },
  { id: "plain", label: "Plain text" },
  { id: "markdown", label: "Markdown" },
  { id: "trimmed", label: "Trimmed" },
];

export interface ClipboardDemo {
  status: ClipStatus;
  clips: ClipView[];
  now?: number;
}

export const Clipboard: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; demo?: ClipboardDemo }> = ({ config, updateConfig, demo }) => {
  const app = coreApp("clipboard")!;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClipFilter>("all");
  const [mode, setMode] = useState<PasteAs>("original");
  const [sel, setSel] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const status = useLoad<ClipStatus>("clip_status", {}, { enabled: !demo, events: ["lens://clip/changed"] });
  const clipsL = useLoad<ClipView[]>("clip_list", { query: query.trim() || null, kind: null }, { enabled: !demo, events: ["lens://clip/changed"] });
  const st = demo?.status ?? status.data;
  const clips = useMemo(() => {
    const all = demo?.clips ?? clipsL.data ?? [];
    const q = query.trim().toLowerCase();
    return filterClips(demo && q ? all.filter((c) => `${c.preview} ${c.title ?? ""} ${c.sourceApp ?? ""}`.toLowerCase().includes(q)) : all, filter);
  }, [demo, clipsL.data, query, filter]);
  const groups = useMemo(() => groupClips(clips, demo?.now), [clips, demo?.now]);
  const flat = groups.flatMap((g) => g.items);
  const current = flat.find((c) => c.id === sel) ?? flat[0] ?? null;

  useEffect(() => {
    if (sel != null && !flat.some((c) => c.id === sel)) setSel(null);
  }, [flat, sel]);

  const run = (p: Promise<unknown>, ok: string) =>
    p
      .then(() => setToast({ text: ok, tone: "ok" }))
      .catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
  const paste = (c: ClipView) => {
    // Hide first so the paste lands in the window you were using.
    getCurrentWindow()
      .hide()
      .catch(() => {})
      .finally(() => invoke("clip_paste", { id: c.id, mode }).catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" })));
  };
  const copy = (c: ClipView) => run(invoke("clip_copy", { id: c.id, mode }), "Copied. Paste anywhere with Ctrl+V.");
  const pin = (c: ClipView) => run(invoke("clip_pin", { id: c.id, pinned: !c.pinned }).then(() => clipsL.reload()), c.pinned ? "Unpinned." : "Pinned: it stays until you unpin it.");
  const shelf = (c: ClipView) => run(invoke("clip_to_shelf", { ids: [c.id], shelf: null }), "Sent to the Shelf.");
  const del = (c: ClipView) => run(invoke("clip_delete", { id: c.id }).then(() => clipsL.reload()), "Removed from history.");

  const move = (d: number) => {
    if (!flat.length) return;
    const i = current ? flat.findIndex((c) => c.id === current.id) : -1;
    const n = Math.max(0, Math.min(flat.length - 1, i + d));
    setSel(flat[n].id);
    document.getElementById(`clip-${flat[n].id}`)?.scrollIntoView({ block: "nearest" });
  };

  const keys = [
    { keys: "Ctrl+F", label: "Search", match: (e: KeyboardEvent) => isKey(e, "f", { ctrl: true }), run: () => searchRef.current?.focus() },
    { keys: "↓", label: "Next item", match: (e: KeyboardEvent) => e.key === "ArrowDown", run: () => move(1) },
    { keys: "↑", label: "Previous item", match: (e: KeyboardEvent) => e.key === "ArrowUp", run: () => move(-1) },
    { keys: "Enter", label: "Paste into the last window", match: (e: KeyboardEvent) => e.key === "Enter" && !!current, run: () => current && paste(current) },
    { keys: "Ctrl+C", label: "Copy (as the Paste-as choice)", match: (e: KeyboardEvent) => isKey(e, "c", { ctrl: true }) && !window.getSelection()?.toString(), run: () => current && copy(current) },
    { keys: "Ctrl+P", label: "Pin / unpin", match: (e: KeyboardEvent) => isKey(e, "p", { ctrl: true }), run: () => current && pin(current) },
    { keys: "Delete", label: "Remove from history", match: (e: KeyboardEvent) => e.key === "Delete" && !(e.target instanceof HTMLInputElement), run: () => current && del(current) },
    { keys: "Ctrl+Shift+V", label: "Cycle Paste as", match: (e: KeyboardEvent) => isKey(e, "v", { ctrl: true, shift: true }), run: () => setMode((m) => PASTE_AS[(PASTE_AS.findIndex((p) => p.id === m) + 1) % PASTE_AS.length].id) },
  ];

  const disabled = st && !st.enabled;

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      keys={keys}
      toolbar={
        <>
          <Tabs
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All" },
              { id: "pinned", label: "Pinned", count: st?.pinned || undefined },
              { id: "text", label: "Text" },
              { id: "link", label: "Links" },
              { id: "image", label: "Images" },
              { id: "files", label: "Files" },
            ]}
          />
          <div className="ca-spacer" />
          <Search value={query} onChange={setQuery} placeholder="Search what you copied" inputRef={searchRef} />
        </>
      }
      meta={st ? `${plural(st.count, "item")} · ${st.pinned} pinned · kept on this PC` : "Loading…"}
      actions={
        current && !disabled ? (
          <>
            <Tabs label="Paste as" value={mode} onChange={setMode} options={PASTE_AS} />
            <Button onClick={() => copy(current)}>Copy</Button>
            <Button variant="primary" onClick={() => paste(current)}>
              Paste
            </Button>
          </>
        ) : undefined
      }
    >
      {status.status === "error" && !demo && <ErrorNote onRetry={status.reload}>{status.error}</ErrorNote>}
      {disabled && (
        <Empty
          title="Clipboard history is off"
          config={config}
          action={
            <Button variant="primary" onClick={() => invoke("open_surface", { label: "settings" }).catch(() => {})}>
              Open Settings
            </Button>
          }
        >
          Turn on Lens clipboard history in Settings to keep what you copy. It stays on this PC, and passwords from password managers are skipped.
        </Empty>
      )}
      {!disabled && !demo && clipsL.status === "loading" && <Skeleton rows={6} />}
      {!disabled && flat.length === 0 && (demo || clipsL.status !== "loading") && (
        <Empty title={query ? `Nothing matches “${query}”` : "Nothing copied yet"} config={config}>
          {query ? "Try fewer words." : "Copy something anywhere and it shows up here."}
        </Empty>
      )}
      {!disabled && flat.length > 0 && (
        <>
          {current && (
            <Hero
              title={`${KIND_LABEL[current.kind]}${current.sourceApp ? ` from ${current.sourceApp}` : ""}`}
              value={<span className="cb-hero">{current.title ?? (current.kind === "image" ? `${current.imageSize?.[0] ?? "?"} × ${current.imageSize?.[1] ?? "?"} image` : current.preview.slice(0, 80))}</span>}
              subtitle={`${current.chars ? `${current.chars.toLocaleString()} characters · ` : ""}${ago(current.tsMs, demo?.now)}`}
            />
          )}
          {groups.map((g) => (
            <Card key={g.label} title={g.label} meta={`${g.items.length}`}>
              <ul className="ca-list" role="listbox" aria-label={g.label}>
                {g.items.map((c) => (
                  <li
                    key={c.id}
                    id={`clip-${c.id}`}
                    role="option"
                    aria-selected={c.id === current?.id}
                    className={cx("ca-item", c.id === current?.id && "selected")}
                    onClick={() => setSel(c.id)}
                    onDoubleClick={() => paste(c)}
                  >
                    <span className="ca-item-icon" aria-hidden>
                      {c.thumbPng ? <img src={c.thumbPng} alt="" /> : c.kind === "link" ? "↗" : c.kind === "files" ? "▤" : "T"}
                    </span>
                    <div className="ca-item-main">
                      <div className="ca-item-title">{c.title ?? c.preview}</div>
                      <div className="ca-item-sub">
                        {[c.sourceApp, c.url, ago(c.tsMs, demo?.now)].filter(Boolean).join(" · ")}
                        {c.localOnly && " · stays local"}
                      </div>
                    </div>
                    {c.pinned && <Pill>Pinned</Pill>}
                    <Button small variant="quiet" aria-label={c.pinned ? "Unpin" : "Pin"} onClick={(e) => (e.stopPropagation(), pin(c))}>
                      {c.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button small variant="quiet" aria-label="Send to the Shelf" onClick={(e) => (e.stopPropagation(), shelf(c))}>
                      Shelf
                    </Button>
                    <Button small variant="quiet" aria-label="Remove from history" onClick={(e) => (e.stopPropagation(), del(c))}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <p className="ca-mono">Double-click or Enter pastes into the window you were using.</p>
        </>
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};
