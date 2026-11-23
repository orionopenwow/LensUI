// Catalogue icon names → lucide icons (one place, so every menu looks the same).
import React from "react";
import {
  AudioLines, BookmarkPlus, Captions, ClipboardCopy, Columns2, Command, Files, Inbox, Languages, Layers, Lightbulb,
  List, MessageCircle, PackagePlus, PenLine, Send, Sparkles, SpellCheck, Table, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "message-circle": MessageCircle, list: List, lightbulb: Lightbulb, languages: Languages, "pen-line": PenLine,
  "spell-check": SpellCheck, table: Table, columns: Columns2, "bookmark-plus": BookmarkPlus, inbox: Inbox,
  "package-plus": PackagePlus, captions: Captions, "audio-lines": AudioLines, layers: Layers,
  "clipboard-copy": ClipboardCopy, files: Files, send: Send, command: Command, sparkles: Sparkles,
};

export const ActionIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => {
  const I = ICONS[name] ?? Sparkles;
  return <I size={size} aria-hidden strokeWidth={2} />;
};
