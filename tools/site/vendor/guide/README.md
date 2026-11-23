# Vendored Lens Guide data

Snapshot of `src/guide/search.ts`, `src/guide/types.ts`, `src/guide/index.json` and `guide/*.md`
from the `feature/lens-guide` branch (commit 7591b92), so the website's "Ask the Guide" and the
user docs build before that branch is merged.

`tools/site/build.mjs` and `tools/site/live/build-live.mjs` prefer the real files when they exist
(`src/guide/…`, `guide/…`). Once the Guide lands on `main`, delete this folder.
