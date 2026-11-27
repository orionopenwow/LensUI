// The pre-save studio: everything you can do with a snip before it's saved — annotate, redact
// (with local OCR suggestions), copy text, translate in place, beautify — then one key to copy,
// save, pin, put on the Shelf, paste to Claude, ask, share or hand to an app.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, Check, Copy, Crop, Droplets, Eraser, Grid3x3, GripVertical, Highlighter, Languages, ListOrdered, MousePointer2,
  PenLine, Redo2, ShieldCheck, Sparkles, Square, SunDim, TextCursor, Type, Undo2, X,
} from "lucide-react";
import type { Analysis, RecentTarget, SnipInfo, SnipSettings, WindowInfo } from "./api";
import { snipExport, snipOpenIn, snipRecent, snipRunningApps, snipShare, snipToClaude } from "./api";
import { ACTIONS, disabledReason, initialFocus, onKey, type ActionId } from "./actions";
import { editingDoc, empty, hiddenBy, isRedacted, newId, nextStep, redactedLines, redactionCount, reduce, TOOL_KEYS, type Doc, type History, type Shape, type Tool } from "./annotations";
import { keyTargetOf, routeKey } from "./keys";
import { EntityChips, LiveTextLayer, LiveTextPill } from "./LiveTextLayer";
import {
  allSel, clampSel, ENTITY_LABEL, findEntities, isMoveKey, lineSel, moveSel, nearestWord, selectedCount, selectionRects, selectionText,
  visibleLines, wordAt, wordCount, wordSel, wordsLabel, type Entity, type Pos, type Sel,
} from "./liveText";
import type { Rect } from "./geom";
import { renderDoc, type TranslatedLine } from "./render";
import { Tip } from "./Tip";
import { PopoverCard, type Popover } from "./StudioPopover";
import { DraftShape, hitTest, safeName, SelBox, union } from "./studioShapes";
import { SafetyFlagBanners } from "../agentsafe/SafetyFlags";
import { useAiRequest } from "../ai/client";
import { failLine, logFail } from "../failsafe/calls";
import type { AiStatus } from "../ai/contract";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#fafafa", "#09090b"];

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
  { id: "select", icon: <MousePointer2 size={15} />, label: "Select", key: "V" },
  { id: "livetext", icon: <TextCursor size={15} />, label: "Select text", key: "L" },
  { id: "arrow", icon: <ArrowUpRight size={15} />, label: "Arrow", key: "A" },
  { id: "box", icon: <Square size={15} />, label: "Box", key: "R" },
  { id: "highlight", icon: <Highlighter size={15} />, label: "Highlight", key: "H" },
  { id: "text", icon: <Type size={15} />, label: "Text", key: "T" },
  { id: "step", icon: <ListOrdered size={15} />, label: "Numbered step", key: "N" },
  { id: "pixelate", icon: <Grid3x3 size={15} />, label: "Pixelate", key: "P" },
  { id: "blur", icon: <Droplets size={15} />, label: "Blur", key: "B" },
  { id: "spotlight", icon: <SunDim size={15} />, label: "Spotlight", key: "S" },
  { id: "pen", icon: <PenLine size={15} />, label: "Pen", key: "D" },
  { id: "crop", icon: <Crop size={15} />, label: "Crop", key: "C" },
];

const BEAUTIFY = [
  { id: "none", label: "Off" },
  { id: "soft", label: "Soft" },
  { id: "vivid", label: "Vivid" },
  { id: "mono", label: "Mono" },
  { id: "theme", label: "Theme" },
];

export interface StudioProps {
  info: SnipInfo;
  settings: SnipSettings;
  ai: AiStatus | null;
  /** Where to place the studio, in overlay CSS px. */
  area: { x: number; y: number; w: number; h: number };
  analysis: Analysis | null;
  /** Freeform lasso in image px. */
  mask?: { x: number; y: number }[] | null;
  onClose: () => void;
  onNew: () => void;
  /** Screenshots: preload state. */
  demo?: { history?: History; popover?: Popover; translation?: TranslatedLine[]; toast?: string; focus?: number; tool?: Tool; textSel?: Sel };
}

export const Studio: React.FC<StudioProps> = ({ info, settings, ai, area, analysis, mask, onClose, onNew, demo }) => {
  const [hist, setHist] = useState<History>(demo?.history ?? empty());
  const [tool, setTool] = useState<Tool>(demo?.tool ?? "arrow");
  const [sel, setSel] = useState<Sel | null>(demo?.textSel ?? null);
  const [copiedFlash, setCopiedFlash] = useState(0);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number; value: string } | null>(null);
  const [beautify, setBeautify] = useState(settings.beautify);
  const [popover, setPopover] = useState<Popover>(demo?.popover ?? null);
  const [toast, setToast] = useState<string | null>(demo?.toast ?? null);
  const [focus, setFocus] = useState(demo?.focus ?? initialFocus(settings.afterCapture));
  const [done, setDone] = useState<Set<ActionId>>(new Set());
  const [recent, setRecent] = useState<RecentTarget[]>([]);
  const [apps, setApps] = useState<WindowInfo[]>([]);
  const [askText, setAskText] = useState("");
  const [lang, setLang] = useState("English");
  const [translation, setTranslation] = useState<TranslatedLine[]>(demo?.translation ?? []);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [preview, setPreview] = useState<string>(info.png);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const run = useAiRequest();
  const doc: Doc = hist.doc;
  const ocrReady = analysis !== null;
  // Text as the exported image shows it: words under a hidden area become "•••".
  // Only what the exported image still shows: words cropped away or outside the freeform outline
  // are not part of the snip any more, so they are not copied, shelved, translated or sent (B-116).
  const shown = useMemo(() => visibleLines(analysis?.ocr?.lines ?? [], hist.doc.crop, mask), [analysis, hist.doc.crop, mask]);
  const hidden = useMemo(() => hiddenBy(hist.doc), [hist.doc]);
  const ocrLines = useMemo(() => redactedLines(shown, hist.doc), [shown, hist.doc]);
  const cut = !!hist.doc.crop || !!(mask && mask.length > 2);
  const ocrText = analysis?.ocr ? (analysis.ocr.lines.length ? ocrLines.join("\n") : cut ? "" : analysis.ocr.text) : "";
  const textSel = clampSel(shown, sel);
  const hasWords = wordCount(shown) > 0;
  const entities = useMemo(() => findEntities(shown, hidden), [shown, hidden]);
  const avail = { ocrReady, hasText: ocrText.trim().length > 0, aiOn: !!ai && ai.active !== "off" };
  const provider = ai?.providers.find((p) => p.id === ai.active);
  const isLocal = provider ? provider.is_local : true;

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = info.png;
  }, [info.png]);

  useEffect(() => {
    if (!settings.showRecent) return;
    snipRecent().then(setRecent).catch((e) => (setRecent([]), logFail("Snip", "load your recent targets")(e)));
  }, [settings.showRecent]);

  useEffect(() => {
    if (popover === "openIn") snipRunningApps().then(setApps).catch((e) => (setApps([]), flash(failLine("Snip", "list the open apps", e))));
  }, [popover]);

  const beautifyOpts = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    return { preset: beautify, accent: cs.getPropertyValue("--lens-accent").trim() || "#6366f1", surface: cs.getPropertyValue("--lens-pack-base").trim() || "#18181b" };
  }, [beautify]);

  const exportCanvas = useCallback(() => {
    if (!img) return null;
    return renderDoc(img, doc, { beautify: beautifyOpts, mask, translation });
  }, [img, doc, beautifyOpts, mask, translation]);

  // Live preview. While you can draw it is the whole frame with every mark burned in (the crop is
  // an outline, B-117); with a frame on it is exactly what will be exported.
  const framed = beautify !== "none";
  useEffect(() => {
    if (!img) return;
    const c = framed ? exportCanvas() : renderDoc(img, editingDoc(doc), { mask, translation });
    if (c) setPreview(c.toDataURL("image/png"));
  }, [exportCanvas, framed, img, doc, mask, translation]);

  const png = () => exportCanvas()?.toDataURL("image/png") ?? info.png;
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3200);
  };
  const markDone = (id: ActionId) => setDone((d) => new Set(d).add(id));

  // ---- live text: copy, highlight or hide exactly the selected words ---------------------------
  const copySel = async () => {
    if (!textSel) return;
    try {
      await navigator.clipboard.writeText(selectionText(shown, textSel, hidden));
      setCopiedFlash((n) => n + 1);
      flash(`Copied ${wordsLabel(selectedCount(shown, textSel))}`);
    } catch (e) {
      flash(failLine("Snip", "copy the text", e));
    }
  };
  const markSel = (how: "highlight" | "hide") => {
    if (!textSel) return;
    const n = selectedCount(shown, textSel);
    if (how === "highlight") {
      const shapes: Shape[] = selectionRects(shown, textSel).map((rect) => ({ id: newId("h"), kind: "highlight", rect, color: "#facc15" }));
      setHist((h) => reduce(h, { type: "addMany", shapes }));
      flash(`Highlighted ${wordsLabel(n)}`);
    } else {
      const rects = selectionRects(shown, textSel).map((rect) => ({ rect, label: "Selected text" }));
      setHist((h) => reduce(h, { type: "redact", rects }));
      flash(`Hid ${wordsLabel(n)}. Burned into what you copy, save or share.`);
    }
    setSel(null);
  };
  const copyEntity = async (en: Entity) => {
    try {
      await navigator.clipboard.writeText(en.value);
      if (editable) {
        setTool("livetext");
        setSel(en.sel);
        setCopiedFlash((n) => n + 1);
      }
      flash(`Copied the ${ENTITY_LABEL[en.kind].toLowerCase()}`);
    } catch (e) {
      flash(failLine("Snip", "copy that", e));
    }
  };
  const pickTool = (t: Tool) => {
    if (t === "livetext" && !hasWords) {
      flash(ocrReady ? "No text found in this snip" : "Reading the text on this PC…");
      return;
    }
    if (t !== "livetext") setSel(null);
    setTool(t);
  };

  const runAction = useCallback(
    async (id: ActionId) => {
      try {
        switch (id) {
          case "copy":
          case "save":
          case "shelf": {
            const r = await snipExport({ id: info.id, png: png(), action: id, ocrText, title: info.sourceTitle || undefined });
            markDone(id);
            flash(r.path && id === "save" ? `Saved — ${r.path}` : r.message);
            break;
          }
          case "pin":
            await snipExport({ id: info.id, png: png(), action: "pin", ocrText });
            onClose();
            break;
          case "copyText":
            await navigator.clipboard.writeText(ocrText);
            markDone(id);
            flash(`Copied ${ocrText.length.toLocaleString()} characters of text`);
            break;
          case "share": {
            const r = await snipShare(info.id, png());
            flash(r.message);
            break;
          }
          default:
            setPopover((p) => (p === id ? null : (id as Popover)));
        }
      } catch (e) {
        flash(String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info.id, ocrText, img, doc, beautify, translation]
  );

  // Keyboard: tools, undo/redo, actions bar.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (textAt) setTextAt(null);
        else if (popover) setPopover(null);
        else if (textSel) setSel(null);
        else onClose();
        return;
      }
      // A focused field, drop-down or button keeps its own keys (B-118).
      if (routeKey(keyTargetOf(e.target), e.key, { ctrl: e.ctrlKey, alt: e.altKey }) === "native") return;
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        setHist((h) => reduce(h, { type: e.shiftKey ? "redo" : "undo" }));
        return;
      }
      if (e.ctrlKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        setHist((h) => reduce(h, { type: "redo" }));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        setHist((h) => reduce(h, { type: "remove", id: selected }));
        setSelected(null);
        return;
      }
      if (tool === "livetext" && editable) {
        if (e.ctrlKey && (e.key === "a" || e.key === "A")) {
          e.preventDefault();
          setSel(allSel(shown));
          return;
        }
        if (textSel && ((e.ctrlKey && !e.shiftKey && (e.key === "c" || e.key === "C")) || e.key === "Enter")) {
          e.preventDefault();
          void copySel();
          return;
        }
        if (!e.ctrlKey && !e.altKey && isMoveKey(e.key)) {
          e.preventDefault();
          setSel(moveSel(shown, textSel, e.key, e.shiftKey));
          return;
        }
      }
      if (!e.ctrlKey && !e.altKey && !e.metaKey && editable && TOOL_KEYS[e.key.toLowerCase()]) {
        pickTool(TOOL_KEYS[e.key.toLowerCase()]);
        return;
      }
      const r = onKey({ focus }, e.key, { ctrl: e.ctrlKey, shift: e.shiftKey }, avail);
      if (r.state.focus !== focus) setFocus(r.state.focus);
      if (r.run) {
        e.preventDefault();
        void runAction(r.run);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // ---- drawing --------------------------------------------------------------------------------
  const W = info.w;
  const H = info.h;
  const editable = beautify === "none";
  const toImg = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  });
  const start = useRef<{ x: number; y: number } | null>(null);
  const textDrag = useRef<{ anchor: Pos | null; from: { x: number; y: number } } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (!editable || e.button !== 0) return;
    const p = toImg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = p;
    if (tool === "livetext") {
      const hit = wordAt(shown, p);
      if (hit && e.shiftKey && textSel) {
        setSel({ anchor: textSel.anchor, focus: hit });
        textDrag.current = { anchor: textSel.anchor, from: p };
      } else {
        setSel(hit ? wordSel(hit) : null);
        textDrag.current = { anchor: hit, from: p };
      }
      return;
    }
    if (tool === "select") {
      const hit = [...doc.shapes].reverse().find((s) => hitTest(s, p));
      setSelected(hit?.id ?? null);
      return;
    }
    if (tool === "step") {
      setHist((h) => reduce(h, { type: "add", shape: { id: newId(), kind: "step", x: p.x, y: p.y, n: nextStep(h.doc), color } }));
      return;
    }
    if (tool === "text") {
      setTextAt({ x: p.x, y: p.y, value: "" });
      return;
    }
    if (tool === "pen") setDraft({ id: newId(), kind: "pen", points: [p.x, p.y], color, width });
  };
  const onMove = (e: React.PointerEvent) => {
    const s0 = start.current;
    if (!s0 || !editable) return;
    const p = toImg(e);
    if (tool === "livetext") {
      const d = textDrag.current;
      if (!d) return;
      // A drag that starts between words picks its first word once the pointer has really moved.
      if (!d.anchor && Math.hypot(p.x - d.from.x, p.y - d.from.y) * scale > 4) d.anchor = nearestWord(shown, d.from);
      if (d.anchor) setSel({ anchor: d.anchor, focus: nearestWord(shown, p) ?? d.anchor });
      return;
    }
    const r = rectFrom(s0, p);
    switch (tool) {
      case "arrow":
        setDraft({ id: "draft", kind: "arrow", x1: s0.x, y1: s0.y, x2: p.x, y2: p.y, color, width });
        break;
      case "box":
        setDraft({ id: "draft", kind: "box", rect: r, color, width });
        break;
      case "highlight":
        setDraft({ id: "draft", kind: "highlight", rect: r, color: color === "#09090b" ? "#facc15" : color });
        break;
      case "pixelate":
      case "blur":
        setDraft({ id: "draft", kind: tool, rect: r, color: "#000", source: "user" });
        break;
      case "spotlight":
      case "crop":
        setDraft({ id: "draft", kind: "spotlight", rect: r, color: "#000" });
        break;
      case "pen":
        setDraft((d) => (d && d.kind === "pen" ? { ...d, points: [...d.points, p.x, p.y] } : d));
        break;
    }
  };
  const onUp = () => {
    start.current = null;
    textDrag.current = null;
    if (!draft) return;
    const big = draft.kind === "arrow" ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6 : draft.kind === "pen" ? draft.points.length > 4 : "rect" in draft && draft.rect.w > 4 && draft.rect.h > 4;
    if (big) {
      if (tool === "crop" && "rect" in draft) setHist((h) => reduce(h, { type: "crop", rect: draft.rect }));
      else setHist((h) => reduce(h, { type: "add", shape: { ...draft, id: newId() } as Shape }));
    }
    setDraft(null);
  };

  const commitText = () => {
    if (textAt && textAt.value.trim()) {
      setHist((h) => reduce(h, { type: "add", shape: { id: newId(), kind: "text", x: textAt.x, y: textAt.y, text: textAt.value.trim(), size: Math.max(16, Math.round(W / 48)), color } }));
    }
    setTextAt(null);
  };

  const suggestions = analysis?.suggestions ?? [];
  const toggleSuggestion = (i: number) => {
    const s = suggestions[i];
    const applied = doc.shapes.find((x) => (x.kind === "pixelate" || x.kind === "blur") && isRedacted({ shapes: [x], crop: null }, s.rect));
    setHist((h) => (applied ? reduce(h, { type: "remove", id: applied.id }) : reduce(h, { type: "redact", rects: [{ rect: s.rect, label: s.label }] })));
  };
  const acceptAll = () =>
    setHist((h) => reduce(h, { type: "redact", rects: suggestions.filter((s) => s.confidence >= 0.6).map((s) => ({ rect: s.rect, label: s.label })) }));

  // ---- translate (local model by default; cloud only through Lens's AI privacy rules) ----------
  const translate = async () => {
    const textLines = ocrLines;
    if (!textLines.length) return;
    await run.ask({
      prompt: `Translate each line into ${lang}. Reply with exactly ${textLines.length} lines, one translation per line, in the same order, and nothing else.`,
      context: { selection: textLines.join("\n"), app_name: info.sourceApp || undefined },
      allow_tools: false,
    });
  };
  useEffect(() => {
    if (run.status !== "done" || !img) return;
    const lines = shown;
    const out = run.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    setTranslation(
      lines.slice(0, out.length).map((l, i) => {
        const rect = l.words.reduce((a, w) => union(a, w.rect), l.words[0].rect);
        return { rect, text: out[i].trim() };
      })
    );
    setPopover(null);
    flash(`Translated ${Math.min(lines.length, out.length)} lines into ${lang}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);
  const consent = run.steps.find((s) => s.state === "awaiting");

  // ---- layout ---------------------------------------------------------------------------------
  const panelW = 280;
  const maxStageW = Math.max(320, area.w - panelW - 48);
  const maxStageH = Math.max(200, area.h - 48 - 56 - 48);
  const scale = Math.min(1, maxStageW / W, maxStageH / H);
  const stageCss = { w: Math.round(W * scale), h: Math.round(H * scale) };
  const studioW = Math.min(area.w, Math.max(720, stageCss.w + panelW + 48));
  const studioH = Math.min(area.h, Math.max(480, stageCss.h + 48 + 56 + 48));
  const left = area.x + (area.w - studioW) / 2;
  const top = area.y + (area.h - studioH) / 2;
  const red = redactionCount(doc);

  const dragStart = (e: React.DragEvent) => {
    const url = png();
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("DownloadURL", `image/png:${safeName(info.sourceTitle)}.png:${url}`);
    e.dataTransfer.setData("text/uri-list", url);
  };

  const recentChip = (t: RecentTarget) => async () => {
    try {
      const r =
        t.kind === "claude"
          ? await snipToClaude({ id: info.id, png: png(), ocrText, target: "desktop" })
          : t.kind === "share"
            ? await snipShare(info.id, png())
            : await snipOpenIn(info.id, png(), t.exe ?? "");
      flash(r.message);
    } catch (e) {
      flash(String(e));
    }
  };

  return (
    <>
      <div className="snip-studio-backdrop" onPointerDown={() => popover && setPopover(null)} />
      <div className="snip-studio" style={{ left, top, width: studioW, height: studioH }} role="dialog" aria-label="Lens Snip studio">
        <div className="snip-toolbar" role="toolbar" aria-label="Annotate">
          {TOOLS.map((t) => (
            <Tip key={t.id} text={`${t.label} (${t.key})`} below>
              <button type="button" className={`snip-btn icon ${tool === t.id ? "on" : ""}`} data-weight="medium" aria-label={t.label} aria-pressed={tool === t.id} aria-keyshortcuts={t.key} disabled={!editable} onClick={() => pickTool(t.id)}>
                {t.icon}
              </button>
            </Tip>
          ))}
          <span className="sep" />
          {COLORS.map((c) => (
            <button key={c} type="button" data-weight="medium" className={`snip-color ${color === c ? "on" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />
          ))}
          <span className="sep" />
          <Tip text="Line width" below>
            <button data-weight="medium" type="button" className="snip-btn" onClick={() => setWidth((w) => (w >= 8 ? 2 : w + 2))} aria-label={`Line width ${width}`}>
              {width}px
            </button>
          </Tip>
          <Tip text="Undo (Ctrl+Z)" below>
            <button type="button" className="snip-btn icon" data-weight="medium" aria-label="Undo" disabled={!hist.past.length} onClick={() => setHist((h) => reduce(h, { type: "undo" }))}>
              <Undo2 size={15} />
            </button>
          </Tip>
          <Tip text="Redo (Ctrl+Y)" below>
            <button type="button" className="snip-btn icon" data-weight="medium" aria-label="Redo" disabled={!hist.future.length} onClick={() => setHist((h) => reduce(h, { type: "redo" }))}>
              <Redo2 size={15} />
            </button>
          </Tip>
          <Tip text="Clear all marks" below>
            <button type="button" className="snip-btn icon" data-weight="medium" aria-label="Clear" disabled={!doc.shapes.length && !doc.crop} onClick={() => setHist((h) => reduce(h, { type: "clear" }))}>
              <Eraser size={15} />
            </button>
          </Tip>
          <span className="grow" />
          <span className="snip-title">
            {info.sourceApp ? `${info.sourceApp} · ` : ""}
            {info.w} × {info.h}
          </span>
          <Tip text="New snip" below>
            <button type="button" className="snip-btn" data-weight="medium" onClick={onNew}>
              New
            </button>
          </Tip>
          <Tip text="Close (Esc)" below>
            <button type="button" className="snip-btn icon" data-weight="medium" aria-label="Close" onClick={onClose}>
              <X size={15} />
            </button>
          </Tip>
        </div>

        {/* Text in the screenshot that reads as instructions to an AI (set aside before any model sees it). */}
        <SafetyFlagBanners sources={["snip"]} />
        <div className="snip-stage">
          <div className="snip-canvas-wrap" style={{ width: editable ? stageCss.w : undefined }}>
            <img src={preview} alt="Snip preview" draggable={false} style={editable ? { width: stageCss.w, height: stageCss.h } : { maxWidth: stageCss.w, maxHeight: stageCss.h, objectFit: "contain" }} />
            {editable ? (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onDoubleClick={(e) => {
                  // Double-click a word: its whole line.
                  if (tool !== "livetext") return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const hit = wordAt(shown, { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H });
                  if (hit) setSel(lineSel(shown, hit.line));
                }}
                style={{ cursor: tool === "select" ? "default" : tool === "livetext" ? "text" : "crosshair" }}
              >
                {tool === "livetext" ? <LiveTextLayer lines={shown} sel={textSel} hidden={hidden} flash={copiedFlash} stroke={Math.max(1, W / 900)} /> : null}
                {suggestions.map((s, i) =>
                  isRedacted(doc, s.rect) ? null : (
                    <rect key={i} x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} rx={3} fill="rgba(239,68,68,0.10)" stroke="#ef4444" strokeDasharray="6 4" strokeWidth={Math.max(1.5, W / 600)} />
                  )
                )}
                {doc.crop ? <path className="snip-crop-dim" fillRule="evenodd" d={`M0 0H${W}V${H}H0Z M${doc.crop.x} ${doc.crop.y}h${doc.crop.w}v${doc.crop.h}h${-doc.crop.w}Z`} /> : null}
                {doc.crop ? <rect x={doc.crop.x} y={doc.crop.y} width={doc.crop.w} height={doc.crop.h} fill="none" stroke="var(--lens-accent-ui)" strokeWidth={Math.max(2, W / 400)} strokeDasharray="8 6" /> : null}
                {selected ? <SelBox shape={doc.shapes.find((s) => s.id === selected)} scale={W / 600} /> : null}
                {draft ? <DraftShape s={draft} crop={tool === "crop"} /> : null}
              </svg>
            ) : null}
            {editable && tool === "livetext" && textSel ? (
              <LiveTextPill lines={shown} sel={textSel} scale={scale} stage={stageCss} onCopy={() => void copySel()} onHighlight={() => markSel("highlight")} onHide={() => markSel("hide")} />
            ) : null}
            {textAt ? (
              <input
                className="snip-input"
                autoFocus
                placeholder="Type, then Enter"
                value={textAt.value}
                onChange={(e) => setTextAt({ ...textAt, value: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && commitText()}
                onBlur={commitText}
                style={{ position: "absolute", left: (textAt.x / W) * stageCss.w, top: (textAt.y / H) * stageCss.h, width: 220 }}
              />
            ) : null}
            <Tip text="Drag into any app to drop the image" className="drag-out">
              <button data-weight="medium" type="button" className="snip-btn icon" draggable onDragStart={dragStart} aria-label="Drag the image out">
                <GripVertical size={15} />
              </button>
            </Tip>
          </div>
        </div>

        <aside className="snip-panel" aria-label="Snip details">
          {popover ? (
            <PopoverCard
              kind={popover}
              isLocal={isLocal}
              providerLabel={provider?.label ?? "Lens Intelligence"}
              aiOn={avail.aiOn}
              ocrChars={ocrText.length}
              info={info}
              askText={askText}
              setAskText={setAskText}
              lang={lang}
              setLang={setLang}
              apps={apps}
              recent={recent}
              running={run.status === "running" || run.status === "waiting"}
              consent={consent ? { callId: consent.call_id, summary: consent.summary } : null}
              onConsent={(ok) => consent && run.confirm(consent.call_id, ok)}
              onCancel={() => {
                run.cancel();
                setPopover(null);
              }}
              onClaude={async (target) => {
                try {
                  const r = await snipToClaude({ id: info.id, png: png(), ocrText, target });
                  if (target === "command") onClose();
                  else flash(r.message);
                } catch (e) {
                  flash(String(e));
                }
                setPopover(null);
              }}
              onAsk={async () => {
                try {
                  await snipToClaude({ id: info.id, png: png(), ocrText, target: "command", prompt: askText });
                  onClose();
                } catch (e) {
                  flash(String(e));
                }
              }}
              onTranslate={translate}
              onOpenIn={async (exe) => {
                try {
                  const r = await snipOpenIn(info.id, png(), exe);
                  flash(r.message);
                  setPopover(null);
                } catch (e) {
                  flash(String(e));
                }
              }}
            />
          ) : null}

          <section className="snip-section" aria-label="Sensitive details">
            <h4>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={13} /> Hide sensitive details
              </span>
              {suggestions.length ? (
                <button data-weight="medium" type="button" className="snip-btn" style={{ height: 24 }} onClick={acceptAll}>
                  Hide all
                </button>
              ) : null}
            </h4>
            {!settings.autoRedact ? (
              <div className="snip-muted">Suggestions are off. Turn on "Suggest what to hide" in Snip settings.</div>
            ) : !ocrReady ? (
              <div className="snip-muted">Reading the text on this PC…</div>
            ) : suggestions.length ? (
              suggestions.map((s, i) => (
                <label key={i} className="snip-sugg">
                  <input type="checkbox" checked={isRedacted(doc, s.rect)} onChange={() => toggleSuggestion(i)} />
                  <span>
                    {s.label}
                    <br />
                    <span className="p">{s.preview}</span>
                  </span>
                  <span className="snip-conf">{s.confidence >= 0.8 ? "Likely" : s.confidence >= 0.6 ? "Maybe" : "Unsure"}</span>
                </label>
              ))
            ) : (
              <div className="snip-muted">Nothing that looks like an email, phone, card, key or IP address.</div>
            )}
            {red ? <div className="snip-muted">{red} area{red === 1 ? " is" : "s are"} hidden. They're burned into the image you copy, save or share.</div> : null}
          </section>

          <section className="snip-section" aria-label="Text in the snip">
            <h4>
              Text
              {avail.hasText ? (
                <button data-weight="medium" type="button" className="snip-btn" style={{ height: 24 }} onClick={() => void runAction("copyText")}>
                  <Copy size={12} /> Copy
                </button>
              ) : null}
            </h4>
            {analysis?.error ? <div className="snip-muted">{analysis.error}</div> : null}
            <EntityChips entities={entities} onCopy={(en) => void copyEntity(en)} />
            {avail.hasText ? <div className="snip-ocr">{ocrText}</div> : ocrReady && !analysis?.error ? <div className="snip-muted">{cut && analysis?.ocr?.lines.length ? "No text in the part you kept." : "No text found."}</div> : null}
            {avail.hasText && editable && tool !== "livetext" ? <div className="snip-muted">Press L to select words on the image.</div> : null}
            {translation.length ? (
              <button data-weight="medium" type="button" className="snip-btn" onClick={() => setTranslation([])}>
                <Languages size={13} /> Show original text
              </button>
            ) : null}
          </section>

          <section className="snip-section" aria-label="Beautify">
            <h4>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={13} /> Frame
              </span>
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {BEAUTIFY.map((b) => (
                <button key={b.id} type="button" data-weight="medium" className={`snip-btn ${beautify === b.id ? "on" : ""}`} aria-pressed={beautify === b.id} onClick={() => setBeautify(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>
            {!editable ? <div className="snip-muted">Turn the frame off to keep drawing.</div> : null}
          </section>
        </aside>

        <div className="snip-actions" role="toolbar" aria-label="Snip actions">
          {ACTIONS.map((a, i) => {
            const why = disabledReason(a.id, avail);
            return (
              <Tip key={a.id} text={why ?? a.hint}>
                <button
                  type="button"
                  className={`snip-chip ${focus === i ? "focus" : ""} ${done.has(a.id) ? "done" : ""}`}
                  data-weight={a.id === "copy" || a.id === "save" ? "heavy" : "medium"}
                  disabled={!!why}
                  aria-keyshortcuts={a.key}
                  onClick={() => {
                    setFocus(i);
                    void runAction(a.id);
                  }}
                >
                  <span className="k">{done.has(a.id) ? <Check size={12} /> : a.key}</span>
                  {a.label}
                </button>
              </Tip>
            );
          })}
          {recent.length && studioW >= 1056 ? <span className="sep" /> : null}
          {recent.slice(0, Math.max(0, Math.floor((studioW - 960) / 96))).map((t) => (
            <Tip key={t.id} text={t.kind === "share" ? "Open the share sheet" : `Copy and bring ${t.label} forward — you press Send`}>
              <button type="button" className="snip-recent" data-weight="light" onClick={recentChip(t)}>
                {t.label}
              </button>
            </Tip>
          ))}
        </div>

        {toast ? (
          <div className="snip-toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </>
  );
};
