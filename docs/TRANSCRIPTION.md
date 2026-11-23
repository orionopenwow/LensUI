# Transcription (local, whisper.cpp)

Lens turns audio and video into text on this PC. Nothing is uploaded.

**Pipeline:** `ffmpeg` (any media → 16 kHz mono PCM WAV) → `whisper-cli` (whisper.cpp) → `.txt`, plus optional `.srt` subtitles.

**Where to start a transcription:**

- Settings › Transcription
- Explorer › right-click a media file › **Transcribe with Lens**
- the browser's **Lens › Transcribe video**
- the `transcribe_file` / `transcribe_url` commands

## Setting it up

The card offers two routes. Lens never downloads anything silently.

1. **Use your own tools.** Point Lens at `whisper-cli.exe` and a `ggml-*.bin` model. Lens also finds `whisper-cli`, `ffmpeg` and `yt-dlp` on `PATH`. A model dropped into `%APPDATA%\LensUI\tools\whisper\` is picked up automatically.
2. **Verified download (opt-in).** The card lists every file before anything happens: its URL, approximate size, licence and destination. Nothing is fetched until you click **Download**. Each file must then match its **pinned SHA-256**, or Lens deletes it.
   - Downloads use Windows' own `curl.exe` (HTTPS only, including redirects, with a size ceiling), and `tar.exe` unpacks the zip.
   - The checksums in `media/setup.rs` (`PINNED`) are still placeholders (`UNPINNED-…`). This session couldn't reach the release hosts to compute them.
   - A placeholder **fails closed**: the plan reports `verified: false`, the button stays disabled, and `run_download` refuses.

### Pinning a new release (maintainers)

1. Download the asset, for example `whisper-bin-x64.zip` from the ggml-org/whisper.cpp release, and the model from `huggingface.co/ggerganov/whisper.cpp`.
2. Run `certutil -hashfile <file> SHA256`, or use the SHA256 shown on Hugging Face's file page. Paste each value into `PINNED[*].sha256`, and bump the URL and label together.
3. `cargo test media::setup` checks the URLs are HTTPS from the two known hosts. A placeholder keeps the download disabled.

## Running a job

| Command | Returns |
| --- | --- |
| `transcribe_file(path, { model?, language?, translate?, srt })` | job id |
| `transcribe_url(url, options)` | job id. Only when **Transcribe web links** is on and yt-dlp is found |
| `transcribe_cancel(id)` | kills the running tool |
| `transcribe_status()` | the last 20 jobs |

**Events:**

- `lens://transcribe/progress {id, pct, stage}`. The stages are `preparing` → `downloading` (links) → `extracting` → `transcribing` (10–95%, from whisper's `-pp` output) → `saving`.
- `lens://transcribe/done {id, text?, txtPath?, srtPath?, error?}`. `text` is capped at 200 KB; the file holds the full transcript.

**Output location:**

- By default: `%APPDATA%\LensUI\transcripts\<name>.txt`, plus `.srt` if asked.
- With **Save next to the original file** on: the source's folder.
- Lens never overwrites an existing file; it adds ` (2)`, ` (3)` and so on to the name.
- Names are cleaned: a single path segment, no reserved device names, at most 80 characters. Every final path must sit inside one of the allowed folders.

**Scratch files** live under `transcripts\.work\<id>\` and are always removed afterwards.

**Exact arguments** (unit-tested):

```
ffmpeg -hide_banner -nostdin -loglevel error -y -i <input> -vn -ac 1 -ar 16000 -c:a pcm_s16le <work>\audio.wav
whisper-cli -m <model> -f <wav> -l <auto|en|…> -otxt -osrt -of <work>\out -pp [-tr] [-t N]
yt-dlp --no-playlist --no-simulate --no-mtime -f bestaudio/best -o <work>\source.%(ext)s
       --print after_move:filepath --print after_move:title -- <url>
```

**How the tools are run:**

- Tools start directly, without a shell, and with no console window (`CREATE_NO_WINDOW`).
- An invalid language falls back to `auto`.
- URLs must be `http(s)`, with no credentials and no localhost.
- The file yt-dlp reports must be inside the job's scratch folder.

**Web links** are off by default. Turning them on requires acknowledging a notice that many sites' terms don't allow downloading, so use it only where you're allowed to.

## Live captions (experimental, design + stub)

`live_captions_start` exists behind the **Live captions (experimental)** switch. For now it honestly returns "not built yet". The design:

1. **Capture.** WASAPI loopback on the default render endpoint: `IAudioClient` with `AUDCLNT_STREAMFLAGS_LOOPBACK`, event-driven in shared mode. The `Win32_Media_Audio` feature is already enabled.
2. **Resample.** Convert the mix format to 16 kHz mono f32, using a simple polyphase or linear resampler (speech quality is enough).
3. **Chunk.** Use 5 s windows with 1 s overlap. A cheap RMS gate skips silence.
4. **Transcribe.** Two options: run `whisper-cli` per chunk (simple, higher latency), or keep a resident `whisper-stream` / whisper.cpp server process with a pipe (lower latency). Choose by measured latency on a mid-range CPU.
5. **Stitch.** Shift cues by the chunk offset (`srt::offset_cues`), drop the overlap duplicates (`cues_to_text` already removes consecutive repeats), and emit `lens://captions/cue {startMs, endMs, text}`.
6. **Display.** A click-through caption bar surface, hidden during fullscreen games, per AGENTS.md.
7. **Privacy.** Captions stay in memory unless the user presses **Save transcript**. A visible indicator shows while capture runs.

## Tests

`cargo test media::` covers:

- argument building for ffmpeg, whisper and yt-dlp;
- progress parsing;
- URL validation and stems;
- SRT parse and format: BOM, CRLF, missing indices, malformed blocks, the timestamp round trip, offsets and repeat dropping;
- path safety: `..`, reserved names, case-insensitive containment, no overwrite, refusing folders outside the allowed set;
- settings validation;
- the pinned-download fail-closed rule;
- SHA-256 against the NIST vectors.
