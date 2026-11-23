# Feature clips

The GIFs and MP4s here are used by the README and the website. Each clip has three files:

| File | Used for |
| :--- | :--- |
| `<id>.mp4` | the website (H.264, muted, loops) |
| `<id>.gif` | the README and the website fallback (kept under 2.5 MB) |
| `<id>.webp` | the poster frame shown before a clip plays |

`clips.json` lists every clip with its title, length and file sizes.

## How they were made

Every clip is rendered from the **real Lens frontend** in a headless browser by [`tools/media/record.mjs`](../../tools/media/record.mjs). It uses the parity harnesses in `tools/parity/`, which run the actual React surfaces against a mocked backend.

- **Live clips** (dock, themes, Playground, pointer effects) are screen recordings of scripted pointer moves, typing and settings changes.
- **Frame clips** (Command, Shelf, voice, approvals, browser, Snip, Guide, Tester Hub) crossfade between real states of each gallery.

> UI preview rendered from the Lens frontend; system integration shown is simulated.

This means the interface in each clip is exactly what Lens draws. The Windows side is not real: other apps' windows, real system events and the actual desktop are mocked. **Real Windows recordings should replace these clips** once the beta has been tested on real machines (see below).

## Re-recording

```sh
bun install
npx playwright install chromium          # once
node tools/parity/build.mjs               # main harness (dock, settings, focus dim, pointer overlay)
node tools/parity/command/build.mjs
node tools/parity/ai/build.mjs
node tools/parity/tester/build.mjs
node tools/site/live/build-live.mjs       # Playground bundle used by the sand and ink clips
node tools/site/build.mjs --data-only     # docs/site/data/packs.json for the Playground page
node tools/media/record.mjs               # all clips; or pass ids: node tools/media/record.mjs dock-magnify themes
```

Galleries for features that are still in open pull requests live on their branches. Check those branches out somewhere, build their gallery (`node tools/parity/<name>/build.mjs`) and point the recorder at them:

| Env var | Branch | Clips |
| :--- | :--- | :--- |
| `LENS_GALLERY_VOICE` | `feature/voice` | voice |
| `LENS_GALLERY_BROWSER` | `feature/lens-browser` | browser-agent, youtube-transcript |
| `LENS_GALLERY_GUIDE` | `feature/lens-guide` | guide |
| `LENS_GALLERY_RIGHTCLICK` | `feature/rightclick-context` | right-click, shelf-packs |
| `LENS_GALLERY_SNIP` | `feature/lens-snip` | snip |
| `LENS_GALLERY_CONTROL` | `feature/claude-control` | approvals |

A missing gallery is skipped, and the clip recorded earlier stays in `clips.json`. Once those branches are merged, the env vars aren't needed.

`ffmpeg` with `libx264` and `libwebp` must be on `PATH`. The GIF step shrinks the width and frame rate until each GIF is under 2.5 MB.

## Replacing a clip with a real recording

1. Record the same moment on a real Windows PC, for example with Lens Snip's recorder or OBS. Aim for 3–8 seconds, a plain wallpaper and no personal data on screen.
2. Convert it with the same settings the recorder uses:
   ```sh
   ffmpeg -i in.mp4 -vf "fps=30,scale=1280:-2" -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart -an docs/media/<id>.mp4
   ffmpeg -i docs/media/<id>.mp4 -vf "fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" docs/media/<id>.gif
   ffmpeg -ss 0.6 -i docs/media/<id>.mp4 -frames:v 1 -c:v libwebp -quality 72 docs/media/<id>.webp
   ```
3. In `clips.json`, set `"real": true` on that clip. The website then drops the "rendered preview" label for it.
