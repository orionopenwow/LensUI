import type { LensConfig } from "../types/lens";

/**
 * "Going back to the first choice restores the settings exactly" for theme choices (B-39).
 *
 * A pack sets more than colours: folder colours, pinned-folder colours, icons, the window frame;
 * Day & night writes a schedule. So picking another theme and then the original used to leave
 * the second pack's folder colours behind, and Day & night → Dark left a schedule that was not
 * there before.
 *
 * `chooseTheme` wraps one theme choice. The first choice in a run remembers every theme-owned
 * setting as it was. A later choice that lands on the same theme and the same Dark/Light/Day &
 * night mode puts those settings back exactly instead of re-applying the pack's own.
 *
 * A run ends as soon as any theme-owned setting changes some other way (the person picks a folder
 * colour, an agent sets the accent, Undo, the schedule switches pack): the next choice starts a
 * new run from what is on screen then, so a deliberate change is never rolled back.
 */

/** Everything a theme choice may write. Compared and restored as a whole. A setting that was
 *  not there (`undefined`) is removed again; one stored as `null` goes back as `null`. */
export interface ThemeOwned {
  theme: LensConfig["theme"];
  iconStyle: LensConfig["iconStyle"] | null | undefined;
  controlStyle: string | null | undefined;
  frameStyle: string | null | undefined;
  folderStyle: LensConfig["folderStyle"] | null | undefined;
  /** Pinned folders' colours, in Dock order, keyed by the folder itself. */
  pinnedFolderThemes: [key: string, theme: string | null][];
  themeSchedule: LensConfig["themeSchedule"] | null | undefined;
}

type PinnedFolder = LensConfig["dock"]["pinnedFolders"][number];
const folderKey = (f: PinnedFolder, index: number): string => {
  const loose = f as unknown as { id?: string; path?: string; name?: string };
  return loose.id ?? loose.path ?? loose.name ?? String(index);
};
const folderTheme = (f: PinnedFolder): string | null => (f as unknown as { theme?: string | null }).theme ?? null;

export function themeOwned(config: LensConfig): ThemeOwned {
  return {
    theme: config.theme,
    iconStyle: config.iconStyle,
    controlStyle: config.windowControls?.style,
    frameStyle: config.windowControls?.frameStyle,
    folderStyle: config.folderStyle,
    pinnedFolderThemes: (config.dock?.pinnedFolders ?? []).map((f, i) => [folderKey(f, i), folderTheme(f)]),
    themeSchedule: config.themeSchedule,
  };
}

/**
 * Same settings, allowing for a save round trip: Lens stores some numbers as 32-bit floats
 * (0.92 comes back as 0.9200000167) and writes `null` for a setting that is not there.
 */
export function sameThemeOwned(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-4;
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameThemeOwned(x, b[i]));
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    if (!sameThemeOwned(ao[key], bo[key])) return false;
  }
  return true;
}

/** Which choice a config shows: the theme and whether Day & night is on. */
function choiceOf(owned: ThemeOwned): string {
  return `${owned.theme.preset}|${owned.themeSchedule?.enabled ? "auto" : "fixed"}`;
}

/** `config` with every theme-owned setting put back to `owned`. Nothing else is touched. */
export function restoreThemeOwned(config: LensConfig, owned: ThemeOwned): LensConfig {
  const colours = new Map(owned.pinnedFolderThemes);
  const out: LensConfig = {
    ...config,
    theme: owned.theme,
    windowControls: { ...config.windowControls },
    dock: {
      ...config.dock,
      pinnedFolders: config.dock.pinnedFolders.map((f, i) => {
        const key = folderKey(f, i);
        if (!colours.has(key)) return f;
        const colour = colours.get(key);
        // Spread first so the keys keep their order: the restored folder is byte-for-byte the old one.
        if (colour != null) return { ...f, theme: colour } as PinnedFolder;
        const { theme: _theme, ...rest } = f as PinnedFolder & { theme?: unknown };
        return rest as PinnedFolder;
      }),
    },
  };
  const put = (target: Record<string, unknown>, key: string, value: unknown) => {
    if (value === undefined) delete target[key];
    else target[key] = value;
  };
  put(out as unknown as Record<string, unknown>, "iconStyle", owned.iconStyle);
  put(out as unknown as Record<string, unknown>, "folderStyle", owned.folderStyle);
  put(out as unknown as Record<string, unknown>, "themeSchedule", owned.themeSchedule);
  put(out.windowControls as unknown as Record<string, unknown>, "style", owned.controlStyle);
  put(out.windowControls as unknown as Record<string, unknown>, "frameStyle", owned.frameStyle);
  return out;
}

export interface ThemeChoiceRun {
  /** Theme-owned settings before the first choice of the run. */
  first: ThemeOwned;
  /** Theme-owned settings after the latest choice of the run. */
  last: ThemeOwned;
}

/** One run per window is enough: a run is a person clicking through themes in one place. */
const shared: { run: ThemeChoiceRun | null } = { run: null };

/**
 * Applies one theme choice. `apply` is the plain change (`applyThemePack`, `applyFeaturedLook`,
 * a Dark/Light/Day & night switch). Returns the config to save.
 */
export function chooseTheme(config: LensConfig, apply: (config: LensConfig) => LensConfig, state: { run: ThemeChoiceRun | null } = shared): LensConfig {
  const now = themeOwned(config);
  if (!state.run || !sameThemeOwned(state.run.last, now)) state.run = { first: now, last: now };
  let next = apply(config);
  if (next === config) return config;
  const first = state.run.first;
  if (choiceOf(themeOwned(next)) === choiceOf(first)) next = restoreThemeOwned(next, first);
  state.run = { first, last: themeOwned(next) };
  return next;
}

/** Forget the run (tests, and after something replaces the whole config such as an import). */
export function resetThemeChoiceRun(state: { run: ThemeChoiceRun | null } = shared): void {
  state.run = null;
}
