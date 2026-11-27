// The lyric translation flow for Now Playing and Immersive (opt-in; translate.ts has the rules).
// Looks for a saved translation first; asks the AI only when the person presses Translate. A cloud
// provider under "Ask each time" stops on the shared Send / Don't send card (ProposalApproval).
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { aiAsk, aiConfirmTool, aiStatus, AI_EVENTS, CONSENT_TOOL, type AiToolProposalEvent } from "../ai/client";
import type { LyricsResult } from "./api";
import { chooseProvider, defaultLanguage, numberedLines, parseTranslation, providerLabel, translatePrompt, translationKey } from "./translate";

export interface SavedTranslation {
  provider: string;
  language: string;
  lines: string[];
}

export type TranslateStatus = "idle" | "working" | "asking" | "done" | "error";

export function useLyricTranslation(lyrics: LyricsResult | null, enabled: boolean, languageSetting: string) {
  const language = languageSetting.trim() || defaultLanguage(typeof navigator !== "undefined" ? navigator.language : "en");
  const lines = lyrics?.found ? lyrics.lines : [];
  const key = lines.length ? translationKey(lines, language) : "";
  const [saved, setSaved] = useState<SavedTranslation | null>(null);
  const [status, setStatus] = useState<TranslateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AiToolProposalEvent | null>(null);
  const run = useRef<{ id: string | null; stop: UnlistenFn[] }>({ id: null, stop: [] });

  // A saved translation for this song and language, if there is one.
  useEffect(() => {
    setSaved(null);
    setStatus("idle");
    setError(null);
    setProposal(null);
    if (!enabled || !key) return;
    let alive = true;
    invoke<SavedTranslation | null>("music_translation_get", { key })
      .then((t) => alive && t && t.lines?.length && (setSaved(t), setStatus("done")))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, key]);

  useEffect(() => () => run.current.stop.forEach((s) => s()), []);

  const translate = useCallback(async () => {
    if (!enabled || !lines.length) return;
    setError(null);
    const status = await aiStatus().catch(() => null);
    const { provider, reason } = chooseProvider(status);
    if (!provider) {
      setStatus("error");
      setError(reason);
      return;
    }
    setStatus("working");
    const label = providerLabel(provider);
    let out = "";
    const stop: UnlistenFn[] = [];
    const finish = () => {
      stop.forEach((s) => s());
      run.current = { id: null, stop: [] };
      setProposal(null);
    };
    const pending: { id: string | null } = { id: null };
    const early: { kind: string; payload: { id: string } & Record<string, unknown> }[] = [];
    const handle = (kind: string, payload: { id: string } & Record<string, unknown>) => {
      if (pending.id === null) return void early.push({ kind, payload });
      if (payload.id !== pending.id) return;
      if (kind === "delta") out += String(payload.text ?? "");
      else if (kind === "proposal" && payload.tool === CONSENT_TOOL) {
        setProposal(payload as unknown as AiToolProposalEvent);
        setStatus("asking");
      } else if (kind === "done") {
        finish();
        if (payload.error) {
          setStatus("error");
          setError(String(payload.error));
          return;
        }
        const t: SavedTranslation = { provider: label, language, lines: parseTranslation(out, lines.length) };
        if (!t.lines.some((l) => l)) {
          setStatus("error");
          setError(`${label} didn't return a translation.`);
          return;
        }
        setSaved(t);
        setStatus("done");
        void invoke("music_translation_put", { key, translation: t }).catch(() => {});
      }
    };
    stop.push(await listen<{ id: string; text: string }>(AI_EVENTS.delta, (e) => handle("delta", e.payload)));
    stop.push(await listen<{ id: string; error?: string }>(AI_EVENTS.done, (e) => handle("done", e.payload)));
    stop.push(await listen<AiToolProposalEvent>(AI_EVENTS.toolProposal, (e) => handle("proposal", e.payload as never)));
    run.current = { id: null, stop };
    try {
      const id = await aiAsk({ prompt: translatePrompt(language, lines.length), context: { selection: numberedLines(lines) }, provider: provider.id, allow_tools: false });
      pending.id = id;
      run.current.id = id;
      for (const e of early.splice(0)) handle(e.kind, e.payload);
    } catch (e) {
      finish();
      setStatus("error");
      setError(String(e));
    }
  }, [enabled, key, language, lines]);

  /** The person's answer on the Send / Don't send card. */
  const decide = useCallback(async (approve: boolean) => {
    const p = proposal;
    if (!p) return;
    setProposal(null);
    setStatus(approve ? "working" : "idle");
    await aiConfirmTool(p.call_id, approve, p.approval_token).catch(() => {});
  }, [proposal]);

  return { language, saved, status, error, proposal, translate, decide, lines: saved?.lines ?? null };
}
