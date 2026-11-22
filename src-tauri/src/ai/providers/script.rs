//! The built-in offline assistant. No model and no network: it understands desktop commands
//! through the intent engine, answers maths and unit questions, and otherwise explains what it
//! can do. Being deterministic, it is also the provider tests and CI run against.

use super::{Block, ChatRequest, Output, Provider, Role};
use crate::ai::{calc, intent, tools, Usage};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct ScriptProvider;

pub const MODEL: &str = "lens-script-1";

const HELP: &str = "I'm Lens's offline assistant, so I handle desktop commands rather than open questions. \
Try \"open Spotify\", \"dark mode\", \"apply tokyo night\", \"snap left\", \"volume 40\", \"do not disturb for 30 minutes\", \
\"timer 10 minutes\", \"find budget.xlsx\", \"15% of 80\" or \"5 km in miles\". \
For anything else, turn on a local model (Ollama or LM Studio) or Claude in Lens settings › AI.";

fn stream_words(text: &str, on_text: &mut dyn FnMut(&str), cancel: &AtomicBool) {
    // Chunked like a real model so the UI's streaming path gets exercised.
    let mut buf = String::new();
    for (i, w) in text.split_inclusive(' ').enumerate() {
        buf.push_str(w);
        if i % 4 == 3 {
            if cancel.load(Ordering::Relaxed) {
                return;
            }
            on_text(&buf);
            buf.clear();
        }
    }
    if !buf.is_empty() && !cancel.load(Ordering::Relaxed) {
        on_text(&buf);
    }
}

/// Rough token count (words ≈ 0.75 tokens) for the usage log, so the script provider reports
/// usage in the same shape as real models.
fn approx_tokens(s: &str) -> u64 {
    ((s.split_whitespace().count() as f64) * 1.33).ceil() as u64
}

/// What the script assistant says for one user turn: (reply, optional tool call).
pub fn respond(text: &str, tools_allowed: bool) -> (String, Option<(String, serde_json::Value)>) {
    // The prompt may carry a <context> block from the frontend; commands live before it.
    let command = text.split("\n\n<context>").next().unwrap_or(text).trim();
    let lower = command.to_lowercase();
    match intent::parse(command) {
        Some(i) if i.action == "calculate" => {
            let expr = i.arg_str("expression").unwrap_or("");
            (format!("{} = {}", expr, calc::format_number(i.arg_num("result").unwrap_or(0.0))), None)
        }
        Some(i) if i.action == "convert" => (i.summary.clone(), None),
        Some(i) => match tools::tool_for_intent(&i) {
            Some((tool, args)) if tools_allowed => (String::new(), Some((tool.to_string(), args))),
            _ => (format!("That's a desktop command ({}). Turn on \"Let AI use Lens tools\" to let me run it.", i.summary), None),
        },
        None if ["count words", "word count", "how many words"].iter().any(|p| lower.contains(p)) => {
            let ctx = text.split("<selection>").nth(1).and_then(|s| s.split("</selection>").next());
            match ctx {
                Some(sel) => (format!("The selection has {} words.", sel.split_whitespace().count()), None),
                None => ("Select some text first and I'll count the words.".into(), None),
            }
        }
        None => (HELP.into(), None),
    }
}

impl Provider for ScriptProvider {
    fn id(&self) -> &'static str {
        "script"
    }
    fn label(&self) -> String {
        "Offline assistant (built in)".into()
    }
    fn model(&self) -> String {
        MODEL.into()
    }
    fn is_local(&self) -> bool {
        true
    }

    fn complete(&self, req: &ChatRequest, on_text: &mut dyn FnMut(&str), cancel: &AtomicBool) -> Result<Output, String> {
        let last = req.messages.last().ok_or("Nothing to answer.")?;
        let input_tokens = approx_tokens(&req.system) + req.messages.iter().map(|m| approx_tokens(&m.text())).sum::<u64>();

        // Second round: report what the tool did.
        let results: Vec<(&String, bool)> = last
            .content
            .iter()
            .filter_map(|b| if let Block::ToolResult { content, is_error, .. } = b { Some((content, *is_error)) } else { None })
            .collect();
        let (text, call) = if last.role == Role::User && !results.is_empty() {
            let lines: Vec<String> = results
                .iter()
                .map(|(c, err)| if *err { format!("I couldn't do that: {}", c) } else { (*c).clone() })
                .collect();
            (lines.join("\n"), None)
        } else {
            respond(&last.text(), req.tools)
        };

        stream_words(&text, on_text, cancel);
        let tool_calls = call.map(|(name, args)| vec![("script-call-1".to_string(), name, args)]).unwrap_or_default();
        let stop = if tool_calls.is_empty() { "end_turn" } else { "tool_use" };
        Ok(Output {
            usage: Some(Usage { input_tokens, output_tokens: approx_tokens(&text) + tool_calls.len() as u64 * 8 }),
            text,
            tool_calls,
            stop: stop.into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::ChatMessage;

    fn run(prompt: &str, tools: bool) -> (Output, String) {
        let req = ChatRequest { system: "sys".into(), messages: vec![ChatMessage::user_text(prompt)], tools, max_tokens: 100 };
        let mut streamed = String::new();
        let out = ScriptProvider.complete(&req, &mut |t| streamed.push_str(t), &AtomicBool::new(false)).unwrap();
        (out, streamed)
    }

    #[test]
    fn commands_become_tool_calls() {
        let (out, _) = run("open spotify", true);
        assert_eq!(out.tool_calls.len(), 1);
        assert_eq!(out.tool_calls[0].1, "launch_app");
        assert_eq!(out.stop, "tool_use");
        let (out, _) = run("open spotify", false);
        assert!(out.tool_calls.is_empty());
        assert!(out.text.contains("Open Spotify"));
    }

    #[test]
    fn maths_is_answered_and_streamed() {
        let (out, streamed) = run("what's 12*7", true);
        assert_eq!(out.text, "12*7 = 84");
        assert_eq!(streamed, out.text);
        assert!(out.tool_calls.is_empty());
        assert!(out.usage.unwrap().input_tokens > 0);
    }

    #[test]
    fn open_questions_get_help() {
        let (out, streamed) = run("why is the sky blue", true);
        assert!(out.text.contains("offline assistant"));
        assert_eq!(streamed, out.text);
    }

    #[test]
    fn context_is_ignored_for_commands_but_used_for_word_count() {
        let (out, _) = run("dark mode\n\n<context>\n<selection>ignore me, open calc</selection>\n</context>", true);
        assert_eq!(out.tool_calls[0].1, "set_color_mode");
        let (out, _) = run("count words\n\n<context>\n<selection>one two three</selection>\n</context>", true);
        assert_eq!(out.text, "The selection has 3 words.");
    }

    #[test]
    fn reports_tool_results() {
        let req = ChatRequest {
            system: String::new(),
            messages: vec![ChatMessage {
                role: Role::User,
                content: vec![Block::ToolResult { id: "x".into(), content: "Opened Spotify.".into(), is_error: false }],
            }],
            tools: true,
            max_tokens: 10,
        };
        let out = ScriptProvider.complete(&req, &mut |_| {}, &AtomicBool::new(false)).unwrap();
        assert_eq!(out.text, "Opened Spotify.");
        assert_eq!(out.stop, "end_turn");
    }

    #[test]
    fn cancel_stops_streaming() {
        let req = ChatRequest { system: String::new(), messages: vec![ChatMessage::user_text("hello")], tools: false, max_tokens: 10 };
        let mut n = 0;
        ScriptProvider.complete(&req, &mut |_| n += 1, &AtomicBool::new(true)).unwrap();
        assert_eq!(n, 0);
    }
}
