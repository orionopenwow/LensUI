# Releasing Lens

This covers how a version gets from `main` to an installer people can download, how updates are
signed, and what is still left to wire. Keep it current when the workflow changes.

## One-time setup (repository owner)

The updater only installs files signed with the project's minisign key. The private key never goes
into the repository.

1. Create the key pair on your own machine (one command, from the repo root):

   ```
   bun run tauri signer generate -w ~/.tauri/lensui.key
   ```

   It asks for a password and writes `~/.tauri/lensui.key` (private) and `~/.tauri/lensui.key.pub`
   (public). Back up the private key and password somewhere safe. If you lose them, existing
   installs can't verify future updates and users must reinstall by hand.

2. In GitHub → Settings → Secrets and variables → Actions:

   | Kind     | Name                                 | Value                                   |
   |----------|--------------------------------------|-----------------------------------------|
   | Secret   | `TAURI_SIGNING_PRIVATE_KEY`          | full contents of `lensui.key`           |
   | Secret   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password (leave empty if none)      |
   | Variable | `TAURI_UPDATER_PUBKEY`               | full contents of `lensui.key.pub`       |

   With the GitHub CLI: `gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/lensui.key`,
   `gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and
   `gh variable set TAURI_UPDATER_PUBKEY < ~/.tauri/lensui.key.pub`.

   `tauri.conf.json` keeps `plugins.updater.pubkey` empty on purpose: the release workflow injects
   the public key at build time, so local builds work without one. A build with an empty key reports
   "Updates are not configured" instead of checking.

## Cutting a release

1. Update the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`
   (all three must match; the workflow refuses a tag that disagrees with `tauri.conf.json`).
2. Move the `Unreleased` notes in `CHANGELOG.md` under the new version.
3. Merge to `main`, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
4. `.github/workflows/release.yml` runs on `windows-latest`:
   - rebuilds `lens_dwm_hook.dll` from source,
   - runs `tauri build --bundles nsis,msi` with `createUpdaterArtifacts` on and the public key
     injected, signing with `TAURI_SIGNING_PRIVATE_KEY`,
   - collects the `.exe`, `.msi`, their `.sig` files, a `latest.json` pointing at the NSIS
     installer, and `SHA256SUMS.txt`,
   - creates a **draft** release named `Lens v0.2.0` with those files (re-running uploads with
     `--clobber` onto the existing release).
5. Open the draft, paste the CHANGELOG section, test the installer on a clean Windows 11 VM, then
   publish. Installed copies only see the update after publishing, because the updater reads
   `releases/latest/download/latest.json`, which skips drafts and pre-releases.

`build.yml` still builds an unsigned installer artifact on tags for CI history; the release
workflow is the one that publishes.

## Updates inside the app

Control Center → Updates. Modes (stored in `%APPDATA%\LensUI\updates.json`):

- **Off**: never contacts GitHub.
- **Tell me** (default): checks at most once a day, a minute after start-up, and shows the new
  version and notes. Nothing downloads until you press Install.
- **Install**: downloads and installs signed updates in the background, then asks to restart.

Every download is checked against the public key before the installer runs; a bad signature aborts.

### Rollback

1. Download the previous version's `.exe` (or `.msi`) from the Releases page and run it. It installs
   over the newer version; settings in `%APPDATA%\LensUI` are kept.
2. Set Updates to **Off** so it doesn't upgrade again, until the fixed version is out.
3. If Lens won't start at all, `Restore-Windows-Shell.bat` and `Restore-Windows-Taskbar.bat` in the
   install folder put Explorer back first. Back up `%APPDATA%\LensUI` (Control Center → Backup)
   before downgrading across a settings-format change.

To pull a bad release: mark it as pre-release or delete it on GitHub. `latest/download` then points at
the previous published release, and clients on "Tell me" stop being offered the bad one.

## Code signing (Authenticode) — not set up yet

The minisign key above only protects the updater. Windows SmartScreen looks at Authenticode
signatures on the `.exe`/`.msi`, and unsigned installers show "Windows protected your PC".

Options, cheapest first:
- **Azure Trusted Signing** (pay-monthly, no hardware token). Add a `bundle.windows.signCommand`
  that calls the `trusted-signing-cli` / `signtool` with the Azure account, and store its client
  ID/secret as Actions secrets.
- **OV/EV certificate** from a CA. Set `bundle.windows.certificateThumbprint`,
  `bundle.windows.digestAlgorithm: "sha256"` and `bundle.windows.timestampUrl` (for example
  `http://timestamp.digicert.com`), and import the certificate in the workflow before building. EV
  removes the SmartScreen warning immediately; OV builds reputation over downloads.

Sign before the updater signatures are produced (Tauri does this when signing is configured), so the
`.sig` matches the signed file.

## winget

After a release is published:

```
wingetcreate new https://github.com/orionopenwow/lensui/releases/download/v0.2.0/Lens.UI_0.2.0_x64-setup.exe
```

(or `komac new`) generates the manifest; submit the PR to `microsoft/winget-pkgs`. Use the
identifier `OrionOpenWow.LensUI`, installer type `nullsoft`, scope `user`. Later versions:
`wingetcreate update OrionOpenWow.LensUI -u <new url> -v <version> --submit`. An unsigned
installer is accepted but gets extra review. Check the real asset file name on the release page;
Tauri derives it from `productName`.

## Microsoft Store / MSIX

Tauri 2 does not produce MSIX directly. Two routes:
- Submit the NSIS/MSI as a Win32 app in Partner Center (simplest; Store hosts the installer link).
- Repackage with the MSIX Packaging Tool. The Store tile logos (`Square*Logo.png`, `StoreLogo.png`)
  are already in `src-tauri/icons/`.

Lens replaces the shell, hooks DWM and can hide the taskbar. Store policy and MSIX containerisation
are likely to block parts of that (shell replacement, DLL injection), so expect a reduced Store build or
a rejection; winget and GitHub Releases remain the main channels.

## Content Security Policy

`app.security.csp` in `tauri.conf.json` (production) is:

| Directive     | Allows | Why |
|---------------|--------|-----|
| `default-src` | `'self' ipc: http://ipc.localhost` | app bundle + Tauri IPC |
| `script-src`  | `'self'` | bundled JS only; no inline, no eval |
| `style-src`   | `'self' 'unsafe-inline'` | React inline styles, user custom CSS, theme `<style>` tags |
| `img-src`     | `'self' asset: http://asset.localhost data: blob:` | icons, wallpapers, thumbnails |
| `media-src`   | `'self' asset: http://asset.localhost blob:` | video wallpapers |
| `font-src`    | `'self' data:` | bundled fonts |
| `connect-src` | `'self' ipc: http://ipc.localhost http://localhost:* http://127.0.0.1:*` | IPC, local AI (Ollama 11434, LM Studio 1234) |
| `frame-src`   | `'self' asset: http://asset.localhost` + Discord, Telegram, Messenger, Google Messages, WhatsApp, Slack web + `localhost:*` | plugin frames, HTML wallpapers, Messaging hub, local TribeCode pane |
| `worker-src`, `object-src` | `'none'` | |
| `base-uri`    | `'self'` | |
| `form-action` | `'none'` | |

`devCsp` adds `'unsafe-inline' 'unsafe-eval'` to `script-src` and the Vite websocket to
`connect-src` for `bun run tauri dev` only. `dangerousDisableAssetCspModification: ["style-src"]`
stops Tauri adding a nonce to `style-src`, which would otherwise switch off `'unsafe-inline'` and
break every inline style.

Plugins run in `<iframe sandbox="allow-scripts">` loaded from their own file, with their own meta
CSP (no network, no parent access). In the harness a hostile plugin could not reach the parent DOM,
`window.top`, cookies, `localStorage`, `__TAURI_INTERNALS__`, `fetch` to the app or asset origins, or
load images.

What this policy blocks today:
- Agents pane endpoints that are not on localhost (a remote OpenAI-compatible URL). Add the origin to
  `connect-src` if that becomes a supported setup.
- A custom Messaging-hub bridge URL that is not in the list above.

What a stricter policy would break:
- Dropping `'unsafe-inline'` from `style-src`: React `style={}` props are fine, but the custom-CSS
  feature, theme packs and the tiling card inject `<style>` text and would stop working.
- Dropping `localhost:*` from `connect-src`/`frame-src`: Ollama, LM Studio and TribeCode panes.
- Dropping the messaging origins: those Messaging hub tabs go blank (many of those sites already
  refuse to be framed; the entries only let them try).

Evidence: headless Chromium harness with the policy injected as a meta tag and Tauri APIs mocked,
every surface in two themes, 0 CSP violations; the four example plugins render and run.

## Plugin grant integrity

`%APPDATA%\LensUI\plugins.json` keeps which permissions each plugin was given. Since 0.2.0:

- A 32-byte key is made with `BCryptGenRandom` on first run and stored at
  `%APPDATA%\LensUI\plugin-grants.key`, encrypted with DPAPI (current user, extra entropy
  `LensUI plugin grants v1`). Another user, or a copy of the file on another PC, can't decrypt it.
- Each plugin's grant list (sorted, deduplicated) is signed with HMAC-SHA256 over
  `lens-plugin-grants-v1\n<id>\n<grants…>` and stored in `grant_sigs`.
- On load, a grant list whose signature is missing or wrong is dropped (comparison is constant-time).
  If the key can't be read at all, every grant is dropped.
- Upgrade: the first run that creates the key signs the grants already in the file, once. Later,
  deleting `grant_sigs` does not re-trust anything.

Limit: a program running as the same Windows user can decrypt DPAPI data too, so it could re-sign
grants. This stops plugins and casual edits from escalating, not malware already running as you.

## Wiring pending

These pieces are written and unit-tested but not registered in `src-tauri/src/lib.rs`, because
`lib.rs` is being split in a parallel change. Add them in one commit; until then plugins don't run
under the new CSP.

```rust
// top of lib.rs, with the other modules
mod win_crash;
mod win_update;
```

```rust
// in run(), before install_exit_restore_handler():
win_crash::install_log_capture();

// first line inside the existing std::panic::set_hook closure:
win_crash::write_crash_report(info);
```

```rust
// builder, next to the global-shortcut plugin:
.plugin(tauri_plugin_updater::Builder::new().build())

// in .setup(), after `let handle = app.handle().clone();`
win_crash::set_feature_flags(&initial_config);
win_update::start_background_check(handle.clone());
```

```rust
// in save_config_cmd, after save_config(&new_config)?;
win_crash::set_feature_flags(&new_config);
```

```rust
// new commands
#[tauri::command]
fn write_plugin_frame_cmd(id: String, html: String) -> Result<String, String> {
    win_plugins::write_plugin_frame(&id, &html)
}

#[tauri::command]
fn list_crash_reports_cmd() -> Vec<win_crash::CrashReportInfo> {
    win_crash::list_crash_reports()
}

#[tauri::command]
fn read_crash_report_cmd(name: String) -> Result<String, String> {
    win_crash::read_crash_report(&name)
}

#[tauri::command]
fn open_crashes_folder_cmd() -> Result<(), String> {
    let dir = win_crash::crashes_dir();
    let _ = std::fs::create_dir_all(&dir);
    launch_path(&dir.to_string_lossy())
}

#[tauri::command]
fn get_update_settings_cmd() -> win_update::UpdateSettings {
    win_update::load_settings()
}

#[tauri::command]
fn set_update_settings_cmd(settings: win_update::UpdateSettings) -> Result<win_update::UpdateSettings, String> {
    win_update::save_settings(settings)
}

#[tauri::command]
async fn check_for_update_cmd(app: AppHandle) -> win_update::UpdateStatus {
    win_update::check(&app).await
}

#[tauri::command]
async fn install_update_cmd(app: AppHandle) -> Result<String, String> {
    win_update::install(&app).await
}
```

```rust
// add to tauri::generate_handler![ ... ]
write_plugin_frame_cmd,
list_crash_reports_cmd,
read_crash_report_cmd,
open_crashes_folder_cmd,
get_update_settings_cmd,
set_update_settings_cmd,
check_for_update_cmd,
install_update_cmd,
```

Capabilities: none needed. The cards call Lens's own commands; `"updater:default"` would only be
needed in `src-tauri/capabilities/default.json` if the JS updater API were used later.

Control Center (`src/surfaces/ControlCenterSurface.tsx`, next to `<BackupRestoreCard />` around line 2674):

```tsx
import { CrashReportsCard } from "./CrashReportsCard";
import { UpdatesCard } from "./UpdatesCard";
// …
<UpdatesCard />
<CrashReportsCard />
```
