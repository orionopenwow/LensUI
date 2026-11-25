# Reporting a problem

**Where:** Settings › About & Testing › Report a problem. Also: the tray menu ("Report a
problem…"), `/report` in Command, and the "Report a problem" button on the card a crashed window
shows.

**What the person fills in:** what happened (required, a few words) and, optionally, the steps.

**What can be attached** (each a switch, defaults in brackets):

| Attachment | Default | Source |
|---|---|---|
| Lens and Windows versions | on | `report::system_text` (Lens, Windows build, WebView2) |
| Recent log | on | last 200 lines of the session log (`tester::ring`) |
| Latest crash report | on | newest file in `%APPDATA%\LensUI\crashes` |
| Self-test | off | the read-only `run_self_test_cmd` |
| Which features are on | off | `config.json` reduced to switches and short choices (`report::settings_summary`): no free text, paths, names, lists, or anything secret-looking |

**Privacy:** the report is built and redacted in Rust (`src-tauri/src/report.rs`) with the Tester
Hub's redaction (`tester::redact_text`): the user profile path, other `C:\Users\<name>` paths,
e-mail addresses, API keys and tokens, and `password=`-style values. The preview in the sheet is
exactly the text that leaves the PC. **Lens uploads nothing.** The person chooses one of:

- **Open on GitHub:** opens `github.com/orionopenwow/LensUI/issues/new` with the title and the
  report in the URL. Reports over 5,000 characters don't fit in a URL: Lens copies the whole
  report to the clipboard first and the issue body asks to paste it. Only links to this repo's
  "new issue" page can be opened from here (`report::is_issue_url`).
- **Copy report.**
- **Save to file:** `Lens problem report <date>.md` in Downloads, shown in Explorer.

The GitHub form (`.github/ISSUE_TEMPLATE/bug_report.yml`) has the same fields for people
reporting from the website.

Tests: `src-tauri/src/report.rs` (redaction of the preview, which parts are included, URL
building and trimming, the settings summary) and `src/__tests__/report.test.ts`.
