# AI browsers: what people praise, what they complain about, and where Lens Browser stands

Research for the site's Lens Browser section, November 2026. Every claim about Lens Browser below is
checked against [BROWSER_AAA.md](BROWSER_AAA.md) and [LENS_BROWSER.md](LENS_BROWSER.md); nothing here
describes a feature that isn't built.

## The browsers people talk about

| Browser | What it's known for | What people push back on |
|---|---|---|
| ChatGPT Atlas (OpenAI) | ChatGPT in every tab, memory, the most aggressive agent mode | Cloud-dependent; security experts warn about prompt injection; slow, janky agent runs in reviews |
| Perplexity Comet | Agentic browsing (shopping, scheduling, forms), citations, model choice | Agent needs a paid plan; uses your logged-in sessions; Brave showed hidden text in images steering it |
| Dia (The Browser Company) | Reusable AI "skills", memory scoped to tabs | macOS first; paid AI tiers; AI requests go through its servers |
| Arc | Vertical sidebar, spaces, command bar, keyboard workflow | Narrower AI; uncertain roadmap |
| Chrome with Gemini | Familiar Chrome plus AI; "auto browse" | Auto browse needs a paid Google AI plan, region-limited |
| Edge with Copilot | Microsoft 365 and Windows integration, admin policies | Agent mode tied to a paid plan; inherits signed-in sessions |
| Brave with Leo | Privacy-first, ad and tracker blocking, local models | Agentic browsing still early |
| Opera Neon, Fellou, Genspark | Agent-first experiments | Small user bases; Brave showed Fellou acting on instructions from a page just by visiting it |

## What people complain about

1. **Agents that act without asking**, using logged-in sessions to buy, send or post. Security
   researchers and OpenAI's own CISO call prompt injection unsolved.
2. **Hidden instructions**: text in a page, or near-invisible text in an image, that the agent obeys.
3. **Privacy**: history and page content going to an AI company's servers.
4. **Speed and weight**: agent tasks that are slow; AI features that raise CPU and memory use.
5. **Paywalls**: the agent part of most AI browsers needs a $15–20/month plan.
6. **Usefulness**: long prompts for simple tasks, wrong results, more novelty than help.

## What people ask browsers for

Vertical tabs (Chrome only added them in April 2026), tab search, workspaces, split view, a clean
reader, transcripts for videos, control over what each site may use, an easy import from the old
browser, and low memory use.

## What Lens Browser does differently (true today)

- **It asks before it acts.** Reading runs. Booking, paying, sending and submitting wait for the
  person, with the exact button and details shown. Passwords are never handled by the agent.
- **AI beside the page, not instead of it.** The page stays the person's; the panel lists every click
  and every word typed, and Esc stops the run.
- **Hidden instructions are flagged, not obeyed.** Text aimed at the AI, including hidden or
  near-invisible text, is shown to the person and left out of what the model acts on.
- **Site permissions are the person's call.** Camera, microphone, location, notifications, clipboard
  and multiple downloads ask under the address bar: block, allow once, or allow for that site, and
  can be taken back. (Built; still to be run on a real PC, per BROWSER_AAA.md.)
- **Light, and easy to come to.** Vertical tabs, one box for tabs, bookmarks, history and search,
  transcripts, and an import from Chrome, Edge, Brave, Vivaldi, Opera, Firefox or Arc that goes item by
  item, never takes passwords, and undoes in one step.
- **Bring your own model.** The AI panel uses the model the person picks, including local ones, and one
  switch turns every AI feature off.

## What the site does with this

The home page leads with the browser after the docks: one headline ("The light browser with an AI that
asks first"), one line, the real browser stepping through new tab → AI beside the page → Needs your OK
→ results → site permissions, and the five points above. The hero tour walks the same flow on the desk,
one step per Next, with the permission bar and the injection flag as optional last stops.

## Sources

- [AI Browser Landscape 2026: Atlas vs Comet vs Arc vs Dia](https://digitalapplied.com/blog/ai-browser-landscape-q2-2026), Digital Applied
- [5 Best AI Browsers for 2026](https://www.techrepublic.com/article/news-best-ai-browsers-2026/), TechRepublic
- [The glaring security risks with AI browser agents](https://techcrunch.com/2025/10/25/the-glaring-security-risks-with-ai-browser-agents/), TechCrunch
- [Agentic AI browsers pose security risks, says Brave report](https://www.digit.in/features/general/chatgpt-atlas-to-comet-agentic-ai-browsers-pose-security-risks-says-brave-report.html), Digit
- [5 reasons why you should not switch to an AI browser](https://www.slashgear.com/2030502/reasons-why-you-shouldnt-switch-to-ai-browser), SlashGear
- [AI-powered browsers are failing](https://futurism.com/future-society/ai-powered-browsers-failing), Futurism
- [Chrome is finally getting vertical tabs](https://techcrunch.com/2026/04/07/chrome-is-finally-getting-vertical-tabs/), TechCrunch
