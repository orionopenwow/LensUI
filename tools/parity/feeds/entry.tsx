// Renders Lens Feeds & Messages scenes for screenshots: ?scene=<name>&preset=<pack>. Fictional data only.
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { applyThemeToDocument } from "../../../src/hooks/useLensState";
import { FeedColumn } from "../../../src/feeds/FeedColumn";
import { DeckView } from "../../../src/feeds/DeckView";
import { DigestCard } from "../../../src/feeds/DigestCard";
import { Compose, PostApproval } from "../../../src/feeds/Compose";
import { Inbox } from "../../../src/messages/Inbox";
import { ConversationView } from "../../../src/messages/ConversationView";
import { FeedsWidget, MessagesWidget, UnreadPill } from "../../../src/messages/Widgets";
import { NOW, SAMPLE_DIGEST, SAMPLE_INBOX, SAMPLE_ITEMS, SAMPLE_LINES, SAMPLE_SOURCES, SAMPLE_TIMELINE } from "../../../src/feeds/sample";
import "../../../src/feeds/Feeds.css";
import "../../../src/messages/Messages.css";

const q = new URLSearchParams(location.search);
const scene = q.get("scene") || "column";
const cfg = (globalThis as any).__lensConfig();
applyThemeToDocument(cfg, { accentHex: "#2D7D9A", accentR: 45, accentG: 125, accentB: 154, appsUseLightTheme: false, systemUsesLightTheme: false } as any);

const stage: React.CSSProperties = {
  height: "100vh",
  boxSizing: "border-box",
  padding: 24,
  display: "flex",
  gap: 24,
  alignItems: "stretch",
  background: "var(--lens-pack-base, #08080b)",
};
const noop = () => {};

function Column({ children, seen }: { children?: React.ReactNode; seen?: number }) {
  return (
    <FeedColumn timeline={SAMPLE_TIMELINE} sources={SAMPLE_SOURCES} filter="all" onFilter={noop} now={NOW} seenTs={seen} width={360}>
      {children}
    </FeedColumn>
  );
}

function Scene() {
  switch (scene) {
    case "column":
      return <div style={stage}><Column seen={NOW - 30 * 60_000} /></div>;
    case "deck":
      return <div style={stage}><div style={{ flex: 1, minWidth: 0 }}><DeckView items={SAMPLE_ITEMS} sources={SAMPLE_SOURCES} now={NOW} onClose={noop} /></div></div>;
    case "digest":
      return (
        <div style={stage}>
          <Column>
            <DigestCard d={{ status: "done", text: SAMPLE_DIGEST.text, hours: 12, itemCount: 8, provider: "local", sources: SAMPLE_DIGEST.sources }} onClose={noop} />
          </Column>
        </div>
      );
    case "compose":
      return (
        <div style={stage}>
          <Column>
            <Compose sources={SAMPLE_SOURCES} initial="Kettle-timer 1.1 is out: quiet hours, a calmer chime, and it still works offline." initialTargets={["bluesky:pip.example", "mastodon:toot.example"]} onReview={noop} onClose={noop} />
          </Column>
        </div>
      );
    case "approval":
      return (
        <div style={stage}>
          <Column>
            <PostApproval text="Kettle-timer 1.1 is out: quiet hours, a calmer chime, and it still works offline." targets={["bluesky:pip.example", "mastodon:toot.example"]} sources={SAMPLE_SOURCES} onApprove={noop} onDeny={noop} />
          </Column>
        </div>
      );
    case "inbox":
      return <div style={stage}><Inbox rows={SAMPLE_INBOX} now={NOW} focus="all" onFocus={noop} /></div>;
    case "conversation":
      return (
        <div style={stage}>
          <Inbox rows={SAMPLE_INBOX} now={NOW} focus="vip" onFocus={noop} activeId="matrix:!garden" />
          <div style={{ width: 400 }}>
            <ConversationView
              c={SAMPLE_INBOX[0]}
              lines={SAMPLE_LINES}
              catchUp={"- Plot 14 is weeded and the water butt is half full\n- Marigold asked you to bring the spare hose on Saturday"}
              onBack={noop}
              pending={{ text: "Yes — I'll bring the hose and the seedlings." }}
              onApprove={noop}
              onDeny={noop}
            />
          </div>
        </div>
      );
    case "focus":
      return (
        <div style={stage}>
          <FocusOpen />
        </div>
      );
    case "widgets":
      return (
        <div style={{ ...stage, alignItems: "flex-start" }}>
          <div style={{ width: 340 }}><FeedsWidget items={SAMPLE_ITEMS} now={NOW} /></div>
          <div style={{ width: 340 }}><MessagesWidget rows={SAMPLE_INBOX} focus="all" /></div>
        </div>
      );
    case "topbar":
      return (
        <div style={{ ...stage, flexDirection: "column", gap: 14 }}>
          <TopBar label="All" unread={{ total: 28, mentions: 3, label: "28", focus: "all" }} />
          <TopBar label="Snoozed" unread={{ total: 28, mentions: 3, label: "28", focus: "snoozed" }} />
        </div>
      );
    default:
      return null;
  }
}

function FocusOpen() {
  // Opens the notch flyout after mount so the screenshot shows the menu.
  React.useEffect(() => {
    (document.querySelector(".lm-notch") as HTMLButtonElement | null)?.click();
  }, []);
  return <Inbox rows={SAMPLE_INBOX} now={NOW} focus="snoozed" onFocus={noop} />;
}

function TopBar({ unread, label }: { unread: any; label: string }) {
  return (
    <div style={{ height: 34, display: "flex", alignItems: "center", gap: 14, padding: "0 14px", borderRadius: 10, background: "var(--lens-bg-surface)", border: "1px solid var(--lens-border)", color: "var(--lens-fg)", font: "12px var(--font-sans)" }}>
      <b>Lens</b>
      <span style={{ color: "var(--lens-fg-muted)" }}>Fernbrook Studio</span>
      <span style={{ flex: 1 }} />
      <UnreadPill unread={unread} />
      <span style={{ color: "var(--lens-fg-muted)" }}>{label === "All" ? "Sat 22 Nov" : "Focus"}</span>
      <span>14:05</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Scene />);
