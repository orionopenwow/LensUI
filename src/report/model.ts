// "Report a problem" (docs/REPORTING.md). Pure parts, unit-tested in src/__tests__/report.test.ts.
// The report text itself is built and redacted in Rust (src-tauri/src/report.rs) so the preview
// is exactly what gets shared.
import type { ReportPreview, ReportRequest } from "../types/generated";

export type { ReportPreview, ReportRequest };

export interface Attachment {
  key: keyof Pick<ReportRequest, "includeSystem" | "includeLog" | "includeCrash" | "includeSelfTest" | "includeSettings">;
  label: string;
  desc: string;
}

/** What can be attached, in the order the sheet lists it. */
export const ATTACHMENTS: Attachment[] = [
  { key: "includeSystem", label: "Lens and Windows versions", desc: "Lens version, Windows build and WebView2." },
  { key: "includeLog", label: "Recent log", desc: "The last 200 lines of this session's log." },
  { key: "includeCrash", label: "Latest crash report", desc: "Only if Lens has crashed on this PC." },
  { key: "includeSelfTest", label: "Self-test", desc: "A read-only health check of Lens." },
  { key: "includeSettings", label: "Which features are on", desc: "Switches and choices only: no text, paths, names or keys." },
];

/** A fresh report: versions, log and the latest crash on; the slower or more personal ones off. */
export function emptyRequest(): ReportRequest {
  return {
    whatHappened: "",
    steps: "",
    includeSystem: true,
    includeLog: true,
    includeCrash: true,
    includeSelfTest: false,
    includeSettings: false,
  };
}

/** Can the report be sent yet? Needs a few words about what happened. */
export function canSend(req: ReportRequest): boolean {
  return req.whatHappened.trim().length >= 4;
}

/** What "Open on GitHub" will tell the person before their browser opens. */
export function openNote(p: ReportPreview | null): string {
  if (!p) return "";
  return p.needsPaste
    ? "The report is long, so it's on your clipboard. Paste it into the issue where it says so."
    : "Your browser opens a new GitHub issue with the report filled in. Nothing is sent until you submit it there.";
}
