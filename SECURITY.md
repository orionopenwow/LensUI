# Security Policy

## Supported Versions

LensUI is currently in active open-source development (`0.1.x`). Security fixes are applied directly to the `main` branch.

## Core Security & Privacy Guarantees

1. **100% Local-First & Zero Telemetry:** LensUI makes zero outbound analytics or telemetry requests. All configuration (`config.json`), workflow macros (`macros.json`), and local LLM training data (`dpo_pairs.jsonl`) stay strictly inside `%APPDATA%\LensUI\`.
2. **Reversible OS Modifications:** Native Windows taskbar hiding, desktop icon condensation, and DWM styling are 100% reversible and automatically restored on normal exit, Ctrl+C, or panic via Win32 console handlers.
3. **Anti-Cheat & Fullscreen Protection:** LensUI explicitly excludes kernel/user-mode anti-cheat processes and fullscreen games from DWM opacity and styling hooks.
4. **No Shell Injection:** Application launches and elevation use native Win32 `ShellExecuteW` directly rather than interpolating paths into `cmd.exe` or PowerShell strings.
5. **Agent Safety Contract:** All local AI and MCP integrations are governed by [`AGENTS.md`](./AGENTS.md).

## Reporting a Vulnerability

If you discover a security vulnerability (privilege escalation, unsafe Win32 hook behavior, command injection, or credential exposure):

- Please **do not** open a public issue with exploit details.
- Report it privately via GitHub Security Advisories on this repository.
- Include steps to reproduce, affected Windows 11 build, and suggested remediation if available.
