# Research notes behind the vision

Quotes are short and only one is taken from each source; everything else is paraphrased. Sources were checked on 2026-11-22.

| Source | What we took from it |
|---|---|
| [Atlassian acquires The Browser Company](https://www.atlassian.com/blog/announcements/atlassian-acquires-the-browser-company) | Browsers built for browsing, not work. Dia is being repositioned as a work browser with AI skills and personal memory. Lens: a work-first browser that is part of the desktop. |
| [Opera Neon launch (TechCrunch)](https://techcrunch.com/2025/09/30/opera-launches-its-ai-centric-neon-browser/) | Tasks bundle chats and tabs. Cards are reusable, chainable prompts. Neon is $19.99/month. Lens: Spaces + packs + custom verbs, free with your own model. |
| [Edge Copilot Mode](https://blogs.windows.com/msedgedev/2025/10/23/meet-copilot-mode-in-edge) | Journeys group past browsing into projects (opt-in). Actions use voice or chat. It shows visual cues while acting. Lens: runs on the dock and the amber dot. |
| [Chrome auto browse](https://blog.google/products-and-platforms/products/chrome/gemini-3-auto-browse/) | Multi-step tasks that pause to confirm purchases and posts. Sign-in is assisted only with permission. Lens blocks sign-in instead. |
| [Zen browser docs](https://docs.zen-browser.app/welcome-to-zen) | Workspaces with their own pinned tabs, Essentials, split view, Glance. Lens: Space stacks and split by drag. |
| [Brave: Comet prompt injection](https://brave.com/blog/comet-prompt-injection/) | Page text must be treated as untrusted. Check each action against the user's intent, confirm sensitive actions, isolate agent browsing. All four are adopted. |
| [OpenAI: hardening Atlas](https://openai.com/index/hardening-atlas-against-prompt-injection) | Injection is a long-term problem; logged-out mode and narrow tasks help. Lens: deterministic gates after the model, a separate profile. |
| [Anthropic: Claude in Chrome](https://claude.com/blog/claude-for-chrome) | Site permissions, confirmations for publishing, buying and sharing, blocked categories, and measured attack-rate reductions. Lens: per-run capabilities and blocked sign-in and payments by default. |
| [The Record: Recall goes opt-in](https://therecord.media/microsoft-reverses-course-recall-opt-in) | Broad capture drew strong backlash; it became opt-in and encrypted. Lens: no ambient capture, ever. |
| [9to5Mac: Rewind shut down after Meta deal](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/) | Screen and audio capture were disabled and data deleted in some regions. Lens: local data the user owns and can export. |
| [Apple Private Cloud Compute](https://security.apple.com/blog/private-cloud-compute/) | On-device first; cloud only when needed, and stateless. Lens: script → local → Claude routing. |
| [MCP 2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) | Stateless transports, Tasks lifecycle, enterprise audit and auth. Lens: runs map to MCP Tasks; audit log. |
| [Raycast MCP manual](https://manual.raycast.com/ai/model-context-protocol) | @-mention servers; read-only tools run without asking; others confirm. Lens: same split, with per-client grants. |
| [GNOME search providers](https://developer.gnome.org/documentation/tutorials/search-provider.html) | Apps feed results into one shell search over D-Bus. Lens: verbs and objects are registered once and shown in every surface. |
| [KDE Activities](https://blogs.kde.org/2026/01/17/streamline-plasma-with-activities-to-be-more-focused-and-productive) | Activities switch wallpaper, widgets, apps and files together. Lens: desktop-wide Spaces. |
| [Perplexity Comet (TechCrunch)](https://techcrunch.com/2025/07/09/perplexity-launches-comet-an-ai-powered-web-browser/) | An assistant sidebar plus agent tasks across tabs. Lens: the same helper in every face, with gates. |
