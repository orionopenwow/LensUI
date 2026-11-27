// Set by vite.config.ts: true only on the dev server started by Launch-Lens-UI.bat (LENS_ADMIN=1),
// false for every `vite build`. Gates Lens Mission Control (docs/MISSION_CONTROL.md). Bundlers that
// don't define it (test rigs) see it as undeclared, so read it as
// `typeof __LENS_ADMIN__ !== "undefined" && __LENS_ADMIN__`.
declare const __LENS_ADMIN__: boolean;
