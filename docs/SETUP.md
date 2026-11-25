# Lens setup

The setup opens over Control Center:

* on the **first launch** after installing or downloading Lens;
* **once after every new version** (Lens compares the running version with `setupSeenVersion`
  in its config); and
* when **Launch-Lens-UI.bat** sees that the folder was updated since the last launch (it sets
  `LENS_SHOW_SETUP=1`).

You can also open it from **Settings › About & Testing › Setup** or by typing **setup** in Command.

## Nothing changes until Finish

Every choice is a draft. The previews draw from it, and only **Finish** writes, through the one
settings writer. It writes only what you picked (`applyChoices` in `src/setup/flow.ts`):

* **Skip setup** (or Esc) on any page writes only `onboardingCompleted` and `setupSeenVersion`, so
  the setup doesn't come back for this version. A new install keeps its defaults: the floating
  Dock and the default theme.
* **Skip this step** forgets what you picked on that page.
* A colour look never changes the Dock. The Dock changes only if you picked one on the Dock page.

Anything that touches Windows (Start with Windows, hiding the taskbar) goes through the same
config switches as Settings, so **Remove all Lens changes** undoes it.

## Pages

| First launch / Run setup again | After an update |
|---|---|
| Welcome | What's new in *version* (from `CHANGELOG.md`) |
| Dock: Floating, Slim, Taskbar, Split, and the screen edge | Extras added since the last setup that are still off (page skipped when there are none) |
| Colour: Dark / Light / Day & night, the featured looks, the accent | Done |
| Optional extras (all off), plus where to set up Windhawk styling and voice transcription | |
| Done: exactly what Finish will change | |

"Day & night" turns on the theme schedule: a light look from 7:00, a dark look from 19:00.

## Adding an extra

Add it to `EXTRAS` in `src/setup/flow.ts` with `since` set to the version it first ships in.
People who update see it once on the extras page of that version's setup; new installs see every
extra. Handle it in `extraIsOn` and `applyChoices`, and add a test.

## What's new

`src/setup/whatsNew.ts` is generated from `CHANGELOG.md` by `node tools/setup/whats-new.mjs`
(`bun run gen:whatsnew`). `src/__tests__/setupFlow.test.ts` fails when it is out of date. Each line
is the first sentence of a changelog bullet, so write the bullets with a plain first sentence.

## Checks

* `bun test src/__tests__/setupFlow.test.ts`: when the setup opens; Skip changes only the seen
  markers; Finish writes only the chosen keys; a look doesn't move the Dock.
* `bun run parity:setup`: screenshots every page of both flows in a dark and a light theme and fails
  on a page error or a page that doesn't render (CI: the Visual parity job).
* Rust: `commands::setup_flow` tests when the setup is due.
