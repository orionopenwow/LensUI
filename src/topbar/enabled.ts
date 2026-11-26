/**
 * The one switch for the Top Bar: `topBar.enabled` (config v4).
 *
 * There used to be two (`topBar.enabled` and `dock.showTopBar`) and the bar showed only when both
 * were on, so a config, an import or an agent that set just one left Settings showing a switch
 * that did not match the screen. Lens folds the old flag into this one when it loads settings
 * (`win_backup::fold_legacy_top_bar_flag`). Every reader on the page goes through here so a
 * second flag cannot creep back in (`topbarEnabled.test.ts` scans for it).
 */

interface TopBarLike {
  enabled?: boolean;
}

interface ConfigLike {
  topBar?: TopBarLike | null;
}

/** A missing section means a config from before the Top Bar existed: on, like the default. */
export function topBarEnabled(config?: ConfigLike | null): boolean {
  return config?.topBar?.enabled !== false;
}

const TOP_BAR_DEFAULTS = {
  enabled: true,
  autoHide: "overlap",
  revealDelayMs: 100,
  hideDelayMs: 350,
  height: 34,
  floating: false,
} as const;

/** The config with the Top Bar turned on or off. Touches `topBar.enabled` and nothing else. */
export function withTopBarEnabled<C extends ConfigLike>(config: C, enabled: boolean): C {
  return { ...config, topBar: { ...TOP_BAR_DEFAULTS, ...(config.topBar ?? {}), enabled } };
}
