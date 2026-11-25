import { invoke } from "@tauri-apps/api/core";
import type { ReportPreview, ReportRequest } from "./model";

export const reportApi = {
  preview: (req: ReportRequest) => invoke<ReportPreview>("bug_report_preview", { req }),
  openIssue: (url: string) => invoke<void>("bug_report_open_issue", { url }),
  /** Returns where it was saved (with the user name replaced). */
  save: (text: string) => invoke<string>("bug_report_save", { text }),
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
