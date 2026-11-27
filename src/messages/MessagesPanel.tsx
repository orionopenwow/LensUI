import React, { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Inbox } from "./Inbox";
import { ConversationView } from "./ConversationView";
import { messagesApi, EVT_UNREAD } from "./api";
import type { Conversation, UnreadDto } from "./model";
import { browserOpen } from "../browser/api";
import { useAiRequest } from "../ai/client";
import { oops, quiet } from "../ui/oops";

/** The live Messages surface: inbox ⇄ conversation, Focus, catch-up, Matrix quick reply. */
export function MessagesPanel() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [unread, setUnread] = useState<UnreadDto | null>(null);
  const [open, setOpen] = useState<Conversation | null>(null);
  const [pending, setPending] = useState<{ id: string; text: string; result?: { ok: boolean; message: string }[] } | null>(null);
  const ai = useAiRequest();
  const [catchUpFor, setCatchUpFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, u] = await Promise.all([messagesApi.inbox(), messagesApi.unread()]);
    setRows(r);
    setUnread(u);
  }, []);

  useEffect(() => {
    // First load: an empty inbox with the reason is better than a silent one.
    void load().catch(oops("load your inbox"));
    let un: (() => void) | null = null;
    void listen<UnreadDto>(EVT_UNREAD, (e) => {
      setUnread(e.payload);
      // An unread event re-reads the inbox; the next event tries again.
      void messagesApi.inbox().then(setRows).catch(quiet);
    }).then((u) => (un = u));
    return () => un?.();
  }, [load]);

  const focus = (mode: "all" | "vip" | "snooze", minutes?: number) =>
    messagesApi.focus(mode, minutes ?? null).then(setUnread, oops(mode === "snooze" ? "snooze notifications" : "change the focus mode"));

  const openApp = (c: Conversation) => {
    // Web-app spaces open in the Lens Browser; desktop deep links go to the OS.
    void browserOpen(c.url).catch(oops(`open ${c.title}`));
  };

  const catchUp = async (c: Conversation) => {
    const lines: [string, string][] = c.lastPreview ? [[c.title, c.lastPreview]] : [];
    if (!lines.length) return;
    const prompt = await messagesApi.catchUp(c.title, lines);
    setCatchUpFor(c.id);
    await ai.ask({ prompt, context: {}, allow_tools: false });
  };

  const review = async (text: string) => {
    if (!open) return;
    const a = await messagesApi.sendRequest(open.id, text);
    setPending({ id: a.approvalId, text: a.text });
  };

  const approve = async () => {
    if (!pending) return;
    try {
      await messagesApi.approve(pending.id);
      await messagesApi.send(pending.id);
      setPending({ ...pending, result: [{ ok: true, message: "Sent." }] });
    } catch (e) {
      setPending({ ...pending, result: [{ ok: false, message: String(e) }] });
    }
  };
  // A sent reply clears itself; a failed one stays until you close it, so it can be read.
  const sentOk = !!pending?.result?.every((r) => r.ok);
  useEffect(() => {
    if (!sentOk) return;
    const t = window.setTimeout(() => setPending(null), 1800);
    return () => window.clearTimeout(t);
  }, [sentOk]);

  const deny = () => {
    // Nothing is sent either way: an approval nobody redeems expires by itself.
    if (pending) void messagesApi.deny(pending.id).catch(quiet);
    setPending(null);
  };

  if (open) {
    return (
      <ConversationView
        c={open}
        catchUp={catchUpFor === open.id ? ai.text : null}
        onBack={() => setOpen(null)}
        onOpenApp={openApp}
        onCatchUp={(c) => void catchUp(c).catch(oops("catch you up"))}
        onReview={(t) => void review(t).catch(oops("prepare that reply"))}
        pending={pending}
        onApprove={approve}
        onDeny={deny}
      />
    );
  }
  return <Inbox rows={rows} focus={unread?.focus ?? "all"} onFocus={(m, n) => void focus(m, n)} onOpen={(c) => (c.canReply ? setOpen(c) : openApp(c))} />;
}
