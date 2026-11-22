// ==WindhawkMod==
// @id              lens-window-style
// @name            Lens UI Native Window Style
// @description     Retroactively applies Lens UI dark obsidian titlebars, custom border colors, and corner roundness natively in-process across Windows 11 apps via DwmSetWindowAttribute.
// @version         1.0.0
// @author          Lens UI
// @include         *
// @exclude         *EasyAntiCheat*
// @exclude         *BEService*
// @exclude         *vgc.exe
// @exclude         *vgtray.exe
// @exclude         *VALORANT*
// @exclude         *cs2.exe
// @exclude         *FortniteClient*
// @exclude         *lens-ui.exe
// @compilerOptions -ldwmapi -luser32
// ==/WindhawkMod==

// ==WindhawkModReadme==
/*
# Lens UI Native Window Style
Bundled companion mod for **Lens UI**. Runs safely inside Windhawk to apply real,
in-process Windows 11 DWM styling retroactively to existing and newly opened windows:
- Matte obsidian dark titlebars (`DWMWA_CAPTION_COLOR`)
- Custom hairline or accent window borders (`DWMWA_BORDER_COLOR`)
- Dynamic corner roundness (`DWMWA_WINDOW_CORNER_PREFERENCE`) synced with Lens Control Center
- Anti-cheat & competitive game exclusions baked in for safety
*/
// ==/WindhawkModReadme==

// ==WindhawkModSettings==
/*
- captionHex: "#0C0C0F"
  $name: Titlebar Color (Hex)
- borderHex: "#27272C"
  $name: Window Border Color (Hex)
- textHex: "#FAFAFA"
  $name: Titlebar Text Color (Hex)
- cornerMode: "round"
  $name: Corner Roundness
  $options:
    - round: Rounded (Default)
    - roundSmall: Subtle Round
    - square: Sharp Square
*/
// ==/WindhawkModSettings==

#include <windows.h>
#include <dwmapi.h>
#include <string>

#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif
#ifndef DWMWA_BORDER_COLOR
#define DWMWA_BORDER_COLOR 34
#endif
#ifndef DWMWA_CAPTION_COLOR
#define DWMWA_CAPTION_COLOR 35
#endif
#ifndef DWMWA_TEXT_COLOR
#define DWMWA_TEXT_COLOR 36
#endif

struct LensDwmSettings {
    COLORREF caption = RGB(12, 12, 15);
    COLORREF border = RGB(39, 39, 44);
    COLORREF text = RGB(250, 250, 250);
    DWORD cornerPref = 2; // DWMWCP_ROUND
};

static LensDwmSettings g_settings;
static HWINEVENTHOOK g_showHook = nullptr;

static COLORREF ParseHexColorRef(PCWSTR hexStr, COLORREF fallback) {
    if (!hexStr) return fallback;
    std::wstring s(hexStr);
    if (!s.empty() && s[0] == L'#') s.erase(0, 1);
    if (s.size() != 6) return fallback;
    try {
        unsigned long val = std::stoul(s, nullptr, 16);
        BYTE r = (BYTE)((val >> 16) & 0xFF);
        BYTE g = (BYTE)((val >> 8) & 0xFF);
        BYTE b = (BYTE)(val & 0xFF);
        return RGB(r, g, b);
    } catch (...) {
        return fallback;
    }
}

static void LoadLensSettings() {
    PCWSTR cap = Wh_GetStringSetting(L"captionHex");
    PCWSTR brd = Wh_GetStringSetting(L"borderHex");
    PCWSTR txt = Wh_GetStringSetting(L"textHex");
    PCWSTR crn = Wh_GetStringSetting(L"cornerMode");

    g_settings.caption = ParseHexColorRef(cap, RGB(12, 12, 15));
    g_settings.border = ParseHexColorRef(brd, RGB(39, 39, 44));
    g_settings.text = ParseHexColorRef(txt, RGB(250, 250, 250));

    if (crn && wcscmp(crn, L"square") == 0) {
        g_settings.cornerPref = 1; // DWMWCP_DONOTROUND
    } else if (crn && wcscmp(crn, L"roundSmall") == 0) {
        g_settings.cornerPref = 3; // DWMWCP_ROUNDSMALL
    } else {
        g_settings.cornerPref = 2; // DWMWCP_ROUND
    }

    Wh_FreeStringSetting(cap);
    Wh_FreeStringSetting(brd);
    Wh_FreeStringSetting(txt);
    Wh_FreeStringSetting(crn);
}

static void ApplyLensStyleToHwnd(HWND hwnd) {
    if (!hwnd || !IsWindow(hwnd) || !IsWindowVisible(hwnd)) return;
    LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if (ex & WS_EX_TOOLWINDOW) return;

    BOOL dark = TRUE;
    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));
    DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &g_settings.caption, sizeof(g_settings.caption));
    DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &g_settings.border, sizeof(g_settings.border));
    DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, &g_settings.text, sizeof(g_settings.text));
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &g_settings.cornerPref, sizeof(g_settings.cornerPref));
}

static void ApplyToAllCurrentProcessWindows() {
    DWORD selfPid = GetCurrentProcessId();
    EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
        DWORD pid = 0;
        GetWindowThreadProcessId(hwnd, &pid);
        if (pid == (DWORD)lParam) {
            ApplyLensStyleToHwnd(hwnd);
        }
        return TRUE;
    }, (LPARAM)selfPid);
}

static void CALLBACK OnWinEvent(
    HWINEVENTHOOK,
    DWORD event,
    HWND hwnd,
    LONG idObject,
    LONG,
    DWORD,
    DWORD
) {
    if (idObject != OBJID_WINDOW || !hwnd) return;
    if (event == EVENT_OBJECT_SHOW || event == EVENT_OBJECT_CREATE || event == EVENT_SYSTEM_FOREGROUND) {
        ApplyLensStyleToHwnd(hwnd);
    }
}

BOOL Wh_ModInit() {
    LoadLensSettings();
    ApplyToAllCurrentProcessWindows();
    g_showHook = SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_OBJECT_SHOW,
        nullptr,
        OnWinEvent,
        GetCurrentProcessId(),
        0,
        WINEVENT_OUTOFCONTEXT
    );
    return TRUE;
}

void Wh_ModSettingsChanged() {
    LoadLensSettings();
    ApplyToAllCurrentProcessWindows();
}

void Wh_ModUninit() {
    if (g_showHook) {
        UnhookWinEvent(g_showHook);
        g_showHook = nullptr;
    }
}
