//! App-aware context: which kind of app is in front, and what Lens offers there.
//! Pure; the frontend mirror is `src/command/contextProviders.ts` (same table, same tests).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppCategory {
    Code,
    Explorer,
    Browser,
    Office,
    Notes,
    Terminal,
    Chat,
    Lens,
    Other,
}

/// (process image names, category). Matched case-insensitively on the file name.
const TABLE: &[(&[&str], AppCategory)] = &[
    (&["code.exe", "code - insiders.exe", "cursor.exe", "devenv.exe", "rider64.exe", "idea64.exe", "pycharm64.exe", "webstorm64.exe", "clion64.exe", "goland64.exe", "sublime_text.exe", "notepad++.exe", "zed.exe", "windsurf.exe", "fleet.exe"], AppCategory::Code),
    (&["explorer.exe"], AppCategory::Explorer),
    (&["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe", "zen.exe", "librewolf.exe", "thorium.exe"], AppCategory::Browser),
    (&["winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe", "olk.exe", "soffice.bin", "swriter.exe", "wps.exe"], AppCategory::Office),
    (&["notepad.exe", "obsidian.exe", "notion.exe", "logseq.exe", "joplin.exe", "typora.exe", "evernote.exe", "wordpad.exe"], AppCategory::Notes),
    (&["windowsterminal.exe", "wt.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "conhost.exe", "wezterm-gui.exe", "alacritty.exe", "mintty.exe", "tabby.exe", "warp.exe", "openconsole.exe"], AppCategory::Terminal),
    (&["slack.exe", "discord.exe", "teams.exe", "ms-teams.exe", "telegram.exe", "whatsapp.exe", "signal.exe", "zoom.exe"], AppCategory::Chat),
    (&["lens-ui.exe", "lens ui.exe", "lensui.exe"], AppCategory::Lens),
];

pub fn file_name(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or(path).trim().to_ascii_lowercase()
}

pub fn categorize(process: &str) -> AppCategory {
    let name = file_name(process);
    TABLE
        .iter()
        .find(|(names, _)| names.contains(&name.as_str()))
        .map(|(_, c)| *c)
        .unwrap_or(AppCategory::Other)
}

/// The quick-action tiles Lens offers first for a category (command ids; "ask" and
/// "shelf-add" are built-in tiles, not templates).
pub fn default_tiles(cat: AppCategory) -> &'static [&'static str] {
    match cat {
        AppCategory::Code => &["explain", "review", "fix", "ask", "shelf-add", "summarise"],
        AppCategory::Explorer => &["summarise", "ask", "shelf-add", "transcribe", "extract", "compare"],
        AppCategory::Browser => &["summarise", "ask-page", "explain", "translate", "shelf-add", "extract"],
        AppCategory::Office | AppCategory::Notes => &["rewrite", "summarise", "fix", "translate", "todo", "shelf-add"],
        AppCategory::Terminal => &["explain-error", "explain", "ask", "shelf-add", "fix", "summarise"],
        AppCategory::Chat => &["rewrite", "summarise", "translate", "todo", "ask", "shelf-add"],
        AppCategory::Lens | AppCategory::Other => &["summarise", "explain", "translate", "rewrite", "ask", "shelf-add"],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categories_by_process_name_and_path() {
        assert_eq!(categorize("C:\\Users\\u\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"), AppCategory::Code);
        assert_eq!(categorize("EXPLORER.EXE"), AppCategory::Explorer);
        assert_eq!(categorize("msedge.exe"), AppCategory::Browser);
        assert_eq!(categorize("WINWORD.EXE"), AppCategory::Office);
        assert_eq!(categorize("WindowsTerminal.exe"), AppCategory::Terminal);
        assert_eq!(categorize("pwsh.exe"), AppCategory::Terminal);
        assert_eq!(categorize("notepad.exe"), AppCategory::Notes);
        assert_eq!(categorize("Slack.exe"), AppCategory::Chat);
        assert_eq!(categorize("game.exe"), AppCategory::Other);
        assert_eq!(categorize(""), AppCategory::Other);
    }

    #[test]
    fn every_category_has_six_tiles() {
        for c in [AppCategory::Code, AppCategory::Explorer, AppCategory::Browser, AppCategory::Office, AppCategory::Notes, AppCategory::Terminal, AppCategory::Chat, AppCategory::Lens, AppCategory::Other] {
            let t = default_tiles(c);
            assert_eq!(t.len(), 6, "{c:?}");
        }
    }
}
