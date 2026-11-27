import React, { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { feedsApi } from "./api";
import { FeedColumn } from "./FeedColumn";
import { DeckView } from "./DeckView";
import { DigestCard, type DigestView } from "./DigestCard";
import { Compose, PostApproval } from "./Compose";
import { shelfPayload, type FilterId, type ItemDto, type SourceView, type TimelineDto } from "./model";
import { shelfAdd } from "../shelf/contract";
import { useAiRequest } from "../ai/client";
import { browserOpen } from "../browser/api";
import "./Feeds.css";
import { failText, quiet } from "../ui/oops";

const SEEN_KEY = "lens.feeds.seenTs";

function openUrl(url: string, failed: (text: string) => void) {
  // Opens in the Lens Browser (its own sign-ins; nothing shared with Lens Feeds).
  void browserOpen(url).catch((e) => failed(failText("open that link", e)));
}

/** The live Feeds surface: column ⇄ deck, digest, compose → approval → post. */
export function FeedsPanel({ initialFilter = "all" as FilterId }: { initialFilter?: FilterId }) {
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [tl, setTl] = useState<TimelineDto | null>(null);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState(false);
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState<{ id: string; text: string; targets: string[]; result?: { ok: boolean; message: string }[] } | null>(null);
  const [digest, setDigest] = useState<DigestView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef<number>(Number(safeGet(SEEN_KEY) ?? 0));
  const ai = useAiRequest();

  const load = useCallback(async (f: FilterId) => {
    const [t, s] = await Promise.all([feedsApi.timeline(f), feedsApi.sources()]);
    setTl(t);
    setSources(s);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setTl(await feedsApi.refresh(filter));
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }, [filter]);

  useEffect(() => {
    void load(filter).catch((e) => setToast(String(e)));
  }, [filter, load]);

  useEffect(() => {
    let un: (() => void) | null = null;
    // A background refresh: the column keeps what it shows and the next update tries again.
    void listen("lens://feeds/updated", () => void load(filter).catch(quiet)).then((u) => (un = u));
    return () => {
      un?.();
      safeSet(SEEN_KEY, String(Date.now()));
    };
  }, [filter, load]);

  useEffect(() => {
    if (!digest) return;
    if (ai.status === "running" || ai.status === "done" || ai.status === "error") {
      setDigest((d) => d && { ...d, text: ai.text, provider: ai.provider, status: ai.status === "running" ? "running" : ai.status === "done" ? "done" : "error", error: ai.error });
    }
  }, [ai.status, ai.text, ai.provider, ai.error, digest === null]);

  const runDigest = async () => {
    try {
      const d = await feedsApi.digest(null);
      if (!d.itemCount) {
        setToast("Nothing new to digest yet.");
        return;
      }
      setDigest({ status: "running", text: "", hours: 12, itemCount: d.itemCount, sources: d.sources });
      // Goes through the AI engine's privacy gate: local model unless the user allowed cloud.
      await ai.ask({ prompt: d.prompt, context: {}, allow_tools: false });
    } catch (e) {
      setToast(String(e));
    }
  };

  const review = async (text: string, targets: string[]) => {
    try {
      const a = await feedsApi.composeRequest(text, targets);
      setComposing(false);
      setPending({ id: a.approvalId, text: a.text, targets: a.targets });
    } catch (e) {
      setToast(String(e));
    }
  };

  const approve = async () => {
    if (!pending) return;
    try {
      await feedsApi.approve(pending.id);
      const res = await feedsApi.post(pending.id);
      setPending({ ...pending, result: res });
      window.setTimeout(() => setPending(null), 2400);
    } catch (e) {
      setToast(String(e));
      setPending(null);
    }
  };

  const deny = () => {
    // Nothing is posted either way: an approval nobody redeems expires after two minutes.
    if (pending) void feedsApi.deny(pending.id).catch(quiet);
    setPending(null);
  };

  const actions = {
    onOpen: (it: ItemDto) => openUrl(it.url, setToast),
    onReadLater: (it: ItemDto) => {
      const p = shelfPayload(it);
      void shelfAdd({ kind: "page", title: p.title, url: p.url, text: p.note, source_app: "Lens Feeds", tags: ["read-later"] }).then(() => setToast("Added to Shelf"), (e) => setToast(failText("add that to the Shelf", e)));
    },
    onSave: (it: ItemDto) => {
      const p = shelfPayload(it);
      void shelfAdd({ kind: "page", title: p.title, url: p.url, text: `${p.note}\n\n${it.text}`, source_app: "Lens Feeds", tags: ["context"] }).then(() => setToast("Saved to context pack"), (e) => setToast(failText("save that to the context pack", e)));
    },
  };

  if (deck) return <DeckView items={tl?.items ?? []} sources={sources} onClose={() => setDeck(false)} actions={actions} />;

  return (
    <FeedColumn
      timeline={tl}
      sources={sources}
      filter={filter}
      onFilter={setFilter}
      seenTs={seen.current}
      busy={busy}
      onRefresh={refresh}
      onDigest={runDigest}
      onCompose={() => setComposing(true)}
      onDeck={() => setDeck(true)}
      actions={actions}
    >
      {toast ? <div className="lf-toast" role="status" onClick={() => setToast(null)}>{toast}</div> : null}
      {digest ? <DigestCard d={digest} onClose={() => setDigest(null)} onOpenRef={(u: string) => openUrl(u, setToast)} /> : null}
      {composing ? <Compose sources={sources} onReview={review} onClose={() => setComposing(false)} /> : null}
      {pending ? <PostApproval text={pending.text} targets={pending.targets} sources={sources} onApprove={approve} onDeny={deny} result={pending.result} /> : null}
    </FeedColumn>
  );
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}
