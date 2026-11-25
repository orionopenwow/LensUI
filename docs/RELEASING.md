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
3. Merge to `main`, then tag and push: `git tag v0.3.0 && git push origin v0.3.0`.
4. `.github/workflows/release.yml` runs on `windows-latest`:
   - rebuilds `lens_dwm_hook.dll` from source,
   - runs `tauri build --bundles nsis,msi` with `createUpdaterArtifacts` on and the public key
     injected, signing with `TAURI_SIGNING_PRIVATE_KEY`,
   - collects the `.exe`, `.msi`, their `.sig` files, a `latest.json` pointing at the NSIS
     installer, and `SHA256SUMS.txt`,
   - creates a **draft** release named `Lens v0.3.0` with those files (re-running uploads with
     `--clobber` onto the existing release).
5. Open the draft, paste the CHANGELOG section, test the installer on a clean Windows 11 VM, then
   publish. Installed copies only see the update after publishing, because the updater reads
   `releases/latest/download/latest.json`, which skips drafts and pre-releases.

`build.yml` still builds an unsigned installer artifact on tags for CI history; the release
workflow is the one that publishes.

## Updates inside the app

Settings › About & Testing › Updates sets the mode (stored in `%APPDATA%\LensUI\updates.json`):

- **Off:** never contacts the network.
- **Tell me** (default): checks at most once a day. When a newer signed release exists, the Top
  Bar shows a "Lens 0.x.y available" pill and one notification. Download, then Restart to update.
- **Get it ready:** checks once a day and downloads the update in the background. The download
  is verified against the updater key before Lens keeps it.

Nothing installs until the person chooses **Restart to update**: the Top Bar pill, the "Lens
0.x.y is ready" notification (opens the Updates card), the Updates card, or `/update` in Command.
Restart to update puts the desktop back the way Lens found it (the same steps as Quit: hooks off,
taskbar back, Explorer back if Lens is the shell), runs the verified installer, and the installer
starts Lens again. If installing fails, Lens starts again on the old version. "Check for
updates…" in the tray menu opens the Updates card and checks.

The Updates card shows the release notes (the `notes` in `latest.json`, from the CHANGELOG
section pasted into the release) under "What's new". Every window gets the same state from
`win_update` through `lens://update-state` (`src/update/useLensUpdate.ts`).

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

## Release wiring

Crash reports (`win_crash`), the updater (`tauri_plugin_updater` and
`win_update::start_background_check`, started from `app/integration.rs`) and the plugin-frame
and crash-report commands (`commands/release.rs`) are registered in `src-tauri/src/lib.rs`.
