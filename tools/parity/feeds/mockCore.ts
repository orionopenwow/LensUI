// Parity mock for Lens Feeds & Messages: base harness mock plus feeds_*/messages_* with fictional data.
import { invoke as baseInvoke } from "../mock/core";
import { SAMPLE_INBOX, SAMPLE_SOURCES, SAMPLE_TIMELINE } from "../../../src/feeds/sample";
export { convertFileSrc, isTauri } from "../mock/core";

const extra: Record<string, (a: any) => any> = {
  feeds_timeline: () => SAMPLE_TIMELINE,
  feeds_sources_list: () => SAMPLE_SOURCES,
  messages_inbox: () => SAMPLE_INBOX,
  messages_unread: () => ({ total: 28, mentions: 3, label: "28", focus: "all" }),
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (extra[cmd]) return (await extra[cmd](args ?? {})) as T;
  return baseInvoke<T>(cmd, args);
}
