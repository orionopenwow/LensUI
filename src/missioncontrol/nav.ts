// Mission Control's pages and sidebar groups (like Settings: plain names, grouped).
export type PageId = "pulse" | "prs" | "bugs" | "suggestions" | "checks" | "roadmap" | "quality" | "releases" | "dev" | "local" | "agents" | "brain" | "setup";
export type Go = (id: PageId) => void;

export const NAV: { group: string; pages: { id: PageId; label: string }[] }[] = [
  { group: "Today", pages: [{ id: "pulse", label: "Pulse" }, { id: "prs", label: "Pull requests" }, { id: "bugs", label: "Bugs" }, { id: "suggestions", label: "Suggestions" }, { id: "checks", label: "Real-PC checks" }] },
  { group: "Plan", pages: [{ id: "roadmap", label: "Roadmap" }, { id: "quality", label: "Quality" }, { id: "releases", label: "Releases" }] },
  { group: "This PC", pages: [{ id: "dev", label: "Dev folder" }, { id: "local", label: "Local Lens" }] },
  { group: "Project", pages: [{ id: "agents", label: "Schedules & agents" }, { id: "brain", label: "Brain" }, { id: "setup", label: "Setup & audit" }] },
];

export const ALL_PAGES: PageId[] = NAV.flatMap((g) => g.pages.map((p) => p.id));

/** Ctrl+1…9 jump to the first nine pages in sidebar order. */
export function pageForDigit(d: number): PageId | null {
  return d >= 1 && d <= 9 ? (ALL_PAGES[d - 1] ?? null) : null;
}

/** ↑/↓ in the sidebar, wrapping. */
export function stepPage(cur: PageId, dir: 1 | -1): PageId {
  const i = ALL_PAGES.indexOf(cur);
  return ALL_PAGES[(i + dir + ALL_PAGES.length) % ALL_PAGES.length];
}
