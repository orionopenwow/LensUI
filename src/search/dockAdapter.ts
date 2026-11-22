import { filterByTab, type RankedItem, type SearchItem, type SearchTab } from "./engine";
import { resultBadge } from "./ResultIcon";

/** The row shape DockSurface already renders. */
export interface DockResult {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  kind: "apps" | "files" | "folders" | "recent" | "action";
  iconUrl: string | null | undefined;
  run: () => void;
}

const KIND_MAP: Record<SearchItem["kind"], DockResult["kind"]> = {
  app: "apps",
  window: "recent",
  file: "files",
  folder: "folders",
  setting: "action",
  action: "action",
  script: "action",
  nl: "action",
  calc: "action",
  shell: "action",
  web: "action",
};

/** Maps unified results to Dock rows, so the Dock ranks exactly like the Launcher and Palette. */
export function toDockResults(
  results: RankedItem[],
  tab: SearchTab,
  activate: (item: SearchItem) => boolean,
  armedKey: string | null
): DockResult[] {
  return filterByTab(results, tab).map((item) => {
    const armed = armedKey === item.key;
    return {
      id: item.key,
      title: item.title,
      subtitle: armed && item.confirm ? item.confirm : item.subtitle ?? "",
      badge: armed ? "Confirm ↵" : resultBadge(item),
      kind: KIND_MAP[item.kind],
      iconUrl: item.iconUrl,
      run: () => {
        activate(item);
      },
    };
  });
}
