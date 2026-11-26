// Typed wrappers over the messages_* commands (src-tauri/src/commands/messages.rs).
import { invoke } from "@tauri-apps/api/core";
import type { AppDto, Conversation, MessagesSettings, SendApproval, UnreadDto } from "../types/generated";

export const EVT_UNREAD = "lens://messages/unread";

export const messagesApi = {
  catalogue: () => invoke<AppDto[]>("messages_catalogue"),
  settings: () => invoke<MessagesSettings>("messages_get_settings"),
  setSettings: (settings: MessagesSettings) => invoke<MessagesSettings>("messages_set_settings", { settings }),
  inbox: () => invoke<Conversation[]>("messages_inbox"),
  unread: () => invoke<UnreadDto>("messages_unread"),
  mirrorStatus: () => invoke<{ status: string; note: string }>("messages_mirror_status"),
  focus: (mode: "all" | "vip" | "snooze", minutes: number | null = null) => invoke<UnreadDto>("messages_focus", { mode, minutes }),
  matrixLogin: (password: string) => invoke<null>("messages_matrix_login", { password }),
  matrixLogout: () => invoke<null>("messages_matrix_logout"),
  matrixSync: () => invoke<Conversation[]>("messages_matrix_sync"),
  sendRequest: (conversation: string, text: string) => invoke<SendApproval>("messages_send_request", { conversation, text }),
  approve: (approvalId: string) => invoke<null>("feeds_approve", { approvalId }),
  deny: (approvalId: string) => invoke<null>("feeds_deny", { approvalId }),
  send: (approvalId: string) => invoke<null>("messages_send", { approvalId }),
  catchUp: (channel: string, lines: [string, string][]) => invoke<string>("messages_catch_up", { channel, lines }),
};
