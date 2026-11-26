// Settings › About & Testing › Magic (preview). Shown only in Tester mode or when a Magic flag is
// already on, so nobody else sees unfinished features. Each card says plainly what it does and
// that it's a preview; turning a flag on changes nothing yet beyond showing its shell.
import React, { useState } from "react";
import { Row, Section, StateNote, Toggle } from "../settings/ui/primitives";
import type { PageProps } from "../settings/pages/common";
import { MAGIC_FLAGS, MAGIC_LABELS, anyOn, magicFlags, withFlag, type MagicFlag } from "./flags";
import { DashboardSurface } from "../dashboard/DashboardSurface";
import { StudioShell } from "../studio/v2/StudioShell";
import { MagicStart } from "../magic/start/MagicStart";
import { NotePreview } from "../shelf/NotePreview";
import { MagicPointerPreview } from "./MagicPointerPreview";
import "./magic-preview.css";

const RISKY: ReadonlySet<MagicFlag> = new Set(["mouse", "startButton"]);

export function shouldShowMagicPreview(config: PageProps["config"]): boolean {
  return !!config?.tester?.enabled || anyOn(config);
}

export const MagicPreviewSection: React.FC<Pick<PageProps, "config" | "updateConfig" | "section">> = ({ config, updateConfig, section }) => {
  const [confirm, setConfirm] = useState<MagicFlag | null>(null);
  if (!shouldShowMagicPreview(config)) return null;
  const flags = magicFlags(config);

  const set = (flag: MagicFlag, on: boolean) => {
    if (on && RISKY.has(flag) && confirm !== flag) {
      setConfirm(flag);
      return;
    }
    setConfirm(null);
    updateConfig(withFlag(config, flag, on));
  };

  return (
    <Section id="magic" title="Magic (preview)" summary="Early previews of the Magic features. Off unless you turn them on." defaultOpen={section === "magic"} forceOpen={section === "magic"}>
      <StateNote kind="info">These are previews. Only Magic Mouse changes Windows (your pointer, put back when it is off), and it asks first.</StateNote>
      {MAGIC_FLAGS.map((f) => (
        <Row key={f} label={MAGIC_LABELS[f].label} desc={MAGIC_LABELS[f].desc}>
          <Toggle label={MAGIC_LABELS[f].label} checked={flags[f]} onChange={(v) => set(f, v)} />
        </Row>
      ))}
      {confirm && (
        <StateNote
          kind="info"
          action={
            <button type="button" className="mpv-confirm" onClick={() => set(confirm, true)}>
              Turn on
            </button>
          }
        >
          {confirm === "mouse"
            ? "Magic Mouse changes your pointer while it's on. Your old pointer comes back when you turn it off, on exit, and with Remove all."
            : "The Magic button changes what a Windows-key tap does. Ctrl+Esc always opens Windows Start, and Windows Start opens if Lens doesn't answer."}
        </StateNote>
      )}
      {(flags.mouse || confirm === "mouse") && <MagicPointerPreview />}
      {flags.mouse && (
        <Row label="Hold time" desc="How long to hold the left button before a drag becomes a grab.">
          <input
            type="range"
            className="mpv-range"
            min={200}
            max={1200}
            step={50}
            value={flags.mouseHoldMs}
            aria-label="Hold time in milliseconds"
            onChange={(e) => updateConfig({ ...config, magicWaves: { ...flags, mouseHoldMs: Number(e.target.value) } })}
          />
          <span className="mpv-value">{flags.mouseHoldMs} ms</span>
        </Row>
      )}
      {flags.dashboard && (
        <div className="mpv-frame" aria-label="Dashboard preview">
          <DashboardSurface flags={{ widgets: flags.widgets, learn: flags.learn }} />
        </div>
      )}
      {flags.startButton && (
        <div className="mpv-frame mpv-frame-small">
          <MagicStart />
        </div>
      )}
      {flags.shelfNotes && (
        <div className="mpv-frame mpv-frame-small">
          <NotePreview
            items={[
              { kind: "page", title: "Sample: a page you kept", text: "A line you highlighted.", url: "https://example.com/article", source_app: "Lens Browser" },
              { kind: "text", title: "Sample: a quick thought", text: "Call back about the design review." },
            ]}
          />
        </div>
      )}
      {flags.studioV2 && (
        <div className="mpv-frame mpv-frame-small">
          <StudioShell initial={{}} />
        </div>
      )}
    </Section>
  );
};
