// Voice gallery: the shared parity mock plus voice_* commands with sample data.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri, calls } from "../mock/core";

const status = {
  config: {
    enabled: true,
    activation: "both",
    ptt_hotkey: "Ctrl+Alt+V",
    ptt_style: "hold",
    mute_hotkey: "Ctrl+Alt+Shift+V",
    wake_phrase: "Hey Lens",
    sensitivity: 0.55,
    mic_id: "",
    language: "en",
    whisper_server_path: "C:\\Tools\\whisper.cpp\\whisper-server.exe",
    whisper_model_path: "C:\\Tools\\whisper.cpp\\models\\ggml-base.en.bin",
    threads: 4,
    cloud_speech: false,
    pause_in_meetings: true,
    pause_in_fullscreen: true,
    confirm_by_voice: true,
    allow_typing: true,
    tts_enabled: true,
    tts_voice: "",
    sounds: true,
    hud_position: "dock",
    disabled_commands: ["lock_screen"],
    aliases: [
      { phrase: "lights out", means: "dark mode" },
      { phrase: "work mode", means: "focus mode on" },
    ],
  },
  phase: "idle",
  muted: false,
  paused_reason: null,
  engine_ready: true,
  engine_error: null,
  hotkey_error: null,
  mic_error: null,
};

export const COMMANDS = [
  { id: "window_action", group: "Windows", title: "Minimise, restore, maximise, pin", examples: ["minimise this", "restore", "pin this on top"], risk: "low" },
  { id: "close_app", group: "Windows", title: "Close a window or app", examples: ["close this window", "close notepad"], risk: "confirm" },
  { id: "snap_window", group: "Windows", title: "Snap the window", examples: ["snap left", "snap right"], risk: "low" },
  { id: "move_window", group: "Windows", title: "Move to another monitor or workspace", examples: ["move this to the next monitor"], risk: "low" },
  { id: "open_app", group: "Apps", title: "Open an app", examples: ["open spotify"], risk: "low" },
  { id: "switch_app", group: "Apps", title: "Switch to an app", examples: ["switch to chrome"], risk: "low" },
  { id: "switch_workspace", group: "Desktop", title: "Switch workspace", examples: ["workspace two"], risk: "low" },
  { id: "open_overview", group: "Desktop", title: "Overview", examples: ["show all windows"], risk: "low" },
  { id: "set_wallpaper_scene", group: "Desktop", title: "Living wallpaper scene", examples: ["show the aurora scene"], risk: "low" },
  { id: "set_color_mode", group: "Look", title: "Dark or light mode", examples: ["dark mode"], risk: "low" },
  { id: "set_theme_pack", group: "Look", title: "Theme", examples: ["theme tokyo night"], risk: "low" },
  { id: "set_accent", group: "Look", title: "Accent colour", examples: ["accent purple"], risk: "low" },
  { id: "set_dock_style", group: "Look", title: "Dock style", examples: ["make the dock slim"], risk: "low" },
  { id: "set_volume", group: "System", title: "Volume", examples: ["volume thirty percent", "louder"], risk: "low" },
  { id: "set_dnd", group: "System", title: "Do Not Disturb", examples: ["do not disturb"], risk: "low" },
  { id: "lock_screen", group: "System", title: "Lock the PC", examples: ["lock the screen"], risk: "confirm" },
  { id: "shelf_add", group: "Shelf & clipboard", title: "Add the selection to the Shelf", examples: ["add this to the shelf"], risk: "low" },
  { id: "paste_last_clip", group: "Shelf & clipboard", title: "Paste the last clip", examples: ["paste the last clip"], risk: "guarded" },
  { id: "dictate", group: "Shelf & clipboard", title: "Type what you say", examples: ["type see you at five"], risk: "guarded" },
  { id: "summarize", group: "Ask & Command", title: "Summarise", examples: ["summarise this page"], risk: "low" },
  { id: "ask", group: "Ask & Command", title: "Ask a question", examples: ["why is the sky blue"], risk: "low" },
  { id: "help", group: "Voice", title: "What can I say?", examples: ["help"], risk: "low" },
  { id: "undo", group: "Voice", title: "Undo the last action", examples: ["undo"], risk: "low" },
];

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "voice_status":
      return status as T;
    case "voice_set_config":
      return { ...status, config: (args as { config: unknown }).config } as T;
    case "voice_commands":
      return COMMANDS as T;
    case "voice_list_mics":
      return [
        { id: "{0.0.1.00000000}.{a1}", name: "Microphone (Shure MV7)" },
        { id: "{0.0.1.00000000}.{b2}", name: "Headset Microphone (WH-1000XM5)" },
      ] as T;
    case "voice_list_tts_voices":
      return ["Microsoft Aria", "Microsoft Guy", "Microsoft Zira Desktop"] as T;
    case "voice_ptt":
    case "voice_mute":
    case "voice_cancel":
    case "voice_answer":
    case "voice_run_text":
    case "voice_test_mic":
    case "voice_speak":
      return null as T;
    case "voice_undo":
      return "Undone: restore the window." as T;
    default:
      return baseInvoke<T>(cmd, args);
  }
}
