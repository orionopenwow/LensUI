# Voice control: research and architecture choice

Goal: "Lens, minimise this" with an always-available, low-CPU, offline-first pipeline on Windows 10 and 11, in an unpackaged Tauri app. Lookups were done on 2026-11-22. Quotes are kept short; everything else is paraphrased.

## Options compared

| Option | What it is | Offline | Licence / cost | Fit for Lens | Verdict |
|---|---|---|---|---|---|
| **Windows.Media.SpeechRecognition** (WinRT) | Built-in recogniser. Constraints can be a list, an SRGS grammar or VCD; it also has a continuous session. | Custom list and grammar constraints run locally. The predefined dictation and web-search grammars need the network. | Free | Microsoft's docs say these APIs work only with **package identity**, so unpackaged apps can't use them. Lens is unpackaged (NSIS/MSI). | **Not usable today.** It would need a sparse package with external location. Revisit if Lens ships an MSIX. |
| **SAPI 5.4** (desktop COM recogniser) | The old in-process recogniser with command-and-control grammars | Yes | Free | Works unpackaged, but Microsoft has moved speech users to Voice Access, and SAPI's accuracy is dated. I couldn't verify that the desktop recogniser still ships for every language on current Windows 11. | Fallback idea only; not built |
| **whisper.cpp** (`whisper-server`) | Local Whisper inference in C/C++. Lens keeps the server running on 127.0.0.1 with the model loaded. | Yes | MIT. Models are MIT. | Recognises short commands well, accents included. Silero VAD is built in through `whisper_full_params.vad` with `vad_model_path` (threshold, min speech/silence). Needs a download the user chooses. | **Chosen for recognition** |
| **Vosk** small model | Kaldi-based recogniser with runtime grammars | Yes | Apache 2.0. The small English model is 40 MB. | Grammar mode suits commands; most small models allow vocabulary changes at runtime. Free speech (ask, dictation) is weaker than Whisper's. | Good alternative engine later. The grammar here (`voice/grammar.rs`) would work unchanged. |
| **openWakeWord** | ONNX wake-word models on a shared feature extractor | Yes | Code Apache 2.0. The **pre-trained models are CC BY-NC-SA 4.0** (non-commercial). | Light: one Raspberry Pi 3 core runs 15–20 models. Targets fewer than 5% false rejects and under 0.5 false accepts per hour. Custom phrases need TTS-generated training data, and the model licence complicates shipping. | Not shipped. A user-trained model is a possible future option. |
| **Porcupine** (Picovoice) | Commercial wake-word engine | Yes | Free-tier AccessKeys **stop working after June 30, 2026** (Picovoice email, reported on the Home Assistant forum). Picovoice says it is focusing on enterprise customers. | Unusable for an open-source app now | **Rejected** |
| **Silero VAD** | Voice-activity detection | Yes | MIT. The JIT model is about 2 MB. A 30 ms chunk takes under 1 ms on one CPU thread at 8 or 16 kHz. | Excellent, but needs ONNX in-process. whisper.cpp already embeds it for trimming inside recognition. | Used through whisper.cpp; Lens gates with its own energy VAD |
| **Windows Voice Access** | Microsoft's voice control for the whole OS | Yes, after a one-time language download | Built in | Windows 11 22H2+ only; English, German, Spanish and French. Wake phrases are "Voice access wake up" and "Voice access mute". The FAQ doesn't describe third-party integration. | Complementary: Lens's own phrase ("Lens…") doesn't collide with it |
| **Talon** | Power-user voice control | Yes | Free, with a paid beta | UX lessons: short, distinct command words beat dictation for control. The learning curve flattens after a couple of weeks. Mixing voice and keyboard mid-thought is slow. | Lessons applied (below) |

### Sources (one short quote at most per source)
- Microsoft Learn, *Speech recognition*: predefined grammars use "a remote web service"; the WinRT APIs need package identity. https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition
- Microsoft Learn, *SpeechRecognitionListConstraint*. https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechrecognitionlistconstraint
- Microsoft Support, *Voice access FAQ*: available in "Windows 11, version 22H2 and later". https://support.microsoft.com/topic/voice-access-frequently-asked-questions-c4c2b5ef-5b01-4fbc-af9c-f4b99dec8888
- openWakeWord on PyPI (0.4.0): performance, targets and model licence. https://pypi.org/project/openwakeword/0.4.0/
- Home Assistant community, *Picovoice confirmed Free Tier AccessKeys will stop working after June 30, 2026*. https://community.home-assistant.io/t/fyi-picovoice-confirmed-free-tier-accesskeys-will-stop-working-after-june-30-2026/1012744
- whisper.cpp VAD test (`tests/test-vad-full.cpp`), with the `vad`, `vad_model_path` and `vad_params` fields. https://huggingface.co/spaces/Xenobd/whisper.cpp/blob/main/tests/test-vad-full.cpp
- whisper.cpp issue #3003 (Silero VAD integration). https://github.com/ggml-org/whisper.cpp/issues/3003
- Silero VAD README: MIT, about 2 MB, under 1 ms per 30 ms chunk. https://raw.githubusercontent.com/snakers4/silero-vad/master/README.md
- Vosk models page: small en-us is 40 MB and Apache 2.0. https://alphacephei.com/vosk/models
- *Voice coding with Talon*, on short distinct commands and the learning curve. https://polyterative.github.io/blog/voice-coding-with-talon

Unverified: the current state of SAPI desktop recognisers on Windows 11 24H2+; whisper-server's exact form fields across releases (Lens sends `file`, `temperature`, `response_format`, `prompt` and `no_timestamps`, and the server ignores fields it doesn't know); and real-world false-accept rates for Lens's energy VAD plus wake-phrase text match.

## Chosen architecture

```
 Push-to-talk key ─┐                          ┌─ voice-only commands (type, paste, Shelf, ask, help, yes/no, undo)
 Dock / Mini mic ──┼─► WASAPI 16 kHz mono ─► whisper-server (127.0.0.1, model loaded) ─► grammar ─┤
 Wake phrase ──────┘    + energy VAD           + bias prompt + Silero trim                     └─ script intent engine ─► AI tool registry (same risk gating as AI/MCP)
 (opt-in)               (frames, pre-roll)                                                          └─ "confirm" → spoken / clicked yes
```

1. **Activation.**
   - Push-to-talk is the default (hold, or press twice). The mic is open only while you talk.
   - The wake phrase is opt-in, behind an "always listening" explainer.
   - In wake mode the energy VAD gates speech. Each utterance of 6 s or less is recognised locally and acted on only if it starts with the wake phrase ("Hey Lens" / "Lens" plus recogniser spellings).
   - This avoids shipping a wake-word model with an unclear licence. The cost is a short Whisper run on each speech segment, and only while wake mode is on and not paused.
2. **Recognition.** whisper.cpp's `whisper-server`, started by Lens on a free loopback port and kept warm. A bias prompt lists Lens vocabulary. Audio is posted as an in-memory WAV and never written to disk.
3. **Understanding.** `voice/grammar.rs`:
   - cleans the transcript (filler, Whisper's silence hallucinations, bracketed tags) and strips the wake phrase;
   - applies user aliases, then voice-only commands;
   - converts spoken numbers to digits only where a number is expected;
   - runs the shared script intent engine, then fuzzy-matches app names ("spot if i" → Spotify);
   - routes questions to Ask, and otherwise suggests "did you mean …".
4. **Acting.** Script intents map to the **same AI tool registry** (`ai/tools.rs`): low-risk tools run; confirm-risk ones (close app, lock, notes) wait for "yes" or a click; blocked ones are refused. Dictation and paste are voice-only (never available to AI) and go through `safety::dictation_allowed`.

### Talon and Voice Access lessons applied
- Commands are short and distinct; dictation needs an explicit "type …", so "type delete all my files" types words and never runs anything.
- One wake phrase, distinct from Voice Access's, plus a mute key and "stop listening".
- Visible feedback at every step: waveform, heard text, command chip, undo.
- Push-to-talk still works when always-listening is paused (except on the lock screen), because pressing the key is explicit.
