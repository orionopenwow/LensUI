// Lens Messages — pure UI model (no Tauri imports; unit-tested).
import type { AppDto, Conversation, MessagesSettings, UnreadDto } from "../types/generated";

export type { AppDto, Conversation, MessagesSettings, UnreadDto };

export const APP_COLORS: Record<string, string> = {
  discord: "#5865f2",
  slack: "#4a154b",
  telegram: "#229ed9",
  whatsapp: "#25d366",
  messenger: "#0084ff",
  instagram: "#e1306c",
  teams: "#5b5fc7",
  gmail: "#ea4335",
  outlook: "#0078d4",
  googlechat: "#00ac47",
  linkedin: "#0a66c2",
  signal: "#3a76f0",
  matrix: "#0dbd8b",
};

export function appColor(app: string): string {
  return APP_COLORS[app] ?? "#71717a";
}

export type InboxTab = "all" | "unread" | "mentions" | "vip";

export function filterInbox(rows: Conversation[], tab: InboxTab, q = ""): Conversation[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (tab === "unread" && r.unread === 0) return false;
    if (tab === "mentions" && r.mentions === 0) return false;
    if (tab === "vip" && !r.vip) return false;
    if (needle && !`${r.title} ${r.lastPreview ?? ""} ${r.app}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function totals(rows: Conversation[]): { unread: number; mentions: number } {
  return rows.reduce((t, r) => ({ unread: t.unread + r.unread, mentions: t.mentions + r.mentions }), { unread: 0, mentions: 0 });
}

/** Top-bar pill text; hidden (null) when there's nothing to show. */
export function pillLabel(u: UnreadDto | null): string | null {
  if (!u) return null;
  if (u.focus === "snoozed") return "Snoozed";
  if (u.total <= 0 && u.mentions <= 0) return null;
  return u.total > 99 ? "99+" : String(u.total);
}

export const FOCUS_MODES: { id: "all" | "vip" | "snooze"; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Every message can alert" },
  { id: "vip", label: "VIP & mentions", hint: "Only people you starred and your keywords" },
  { id: "snooze", label: "Snooze", hint: "Badges update quietly; nothing pings" },
];

export const SNOOZE_OPTIONS = [30, 60, 120, 240];

/** "What Lens can do here" — shown in the conversation header so nobody expects more. */
export function capability(c: Conversation): string {
  if (c.canReply) return "Quick reply via Matrix";
  if (c.source.startsWith("space:")) return "Opens in its own web-app space · badge only";
  return "Opens the app · badge from notifications";
}
