// Starting points for the Dashboard: which layout a new person gets and the sample cards the
// parity harness and the Tester preview use. Sample cards are clearly invented and never shown
// outside the preview.
import type { Card, LayoutId } from "./store";

export const DEFAULT_LAYOUT: LayoutId = "glance";

export function sampleCards(now: number): Card[] {
  const min = 60_000;
  return [
    { id: "s1", lane: "inbox", title: "Sample: Alex", detail: "Lunch at 1?", source: "Sample · Messages", at: now - 4 * min },
    { id: "s2", lane: "inbox", title: "Sample: Team", detail: "Build is green", source: "Sample · Messages", at: now - 30 * min },
    { id: "s3", lane: "today", title: "Sample: Design review", detail: "2:00 PM", source: "Sample · Calendar", at: now },
    { id: "s4", lane: "shelf", title: "Sample: clipped quote", source: "Sample · Shelf", at: now - 60 * min },
    { id: "s5", lane: "feeds", title: "Sample: a post you follow", source: "Sample · Feeds", at: now - 90 * min },
  ];
}
