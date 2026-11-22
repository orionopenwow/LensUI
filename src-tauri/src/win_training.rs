use crate::config::config_dir;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DpoPair {
    pub ts: u64,
    pub prompt: String,
    pub chosen: String,
    pub rejected: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowMacroStep {
    pub kind: String,
    pub label: String,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowMacro {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub steps: Vec<WorkflowMacroStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingStats {
    pub pair_count: usize,
    pub file_path: String,
    pub file_size_bytes: u64,
    pub recent_pairs: Vec<DpoPair>,
    pub macros: Vec<WorkflowMacro>,
}

pub fn training_dir() -> PathBuf {
    let dir = config_dir().join("training");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn dpo_file_path() -> PathBuf {
    training_dir().join("dpo_pairs.jsonl")
}

pub fn macros_file_path() -> PathBuf {
    training_dir().join("macros.json")
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn record_dpo_pair(
    prompt: String,
    chosen: String,
    rejected: String,
    source: String,
) -> Result<DpoPair, String> {
    let pair = DpoPair {
        ts: now_epoch_secs(),
        prompt,
        chosen,
        rejected,
        source,
    };
    let line = serde_json::to_string(&pair).map_err(|e| e.to_string())?;
    let path = dpo_file_path();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    Ok(pair)
}

pub fn load_macros() -> Vec<WorkflowMacro> {
    let path = macros_file_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<WorkflowMacro>>(&s).ok())
        .unwrap_or_default()
}

pub fn save_workflow_macro(item: WorkflowMacro) -> Result<Vec<WorkflowMacro>, String> {
    let mut list = load_macros();
    if let Some(existing) = list.iter_mut().find(|m| m.id == item.id) {
        *existing = item;
    } else {
        list.insert(0, item);
    }
    let path = macros_file_path();
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(list)
}

pub fn delete_workflow_macro(id: &str) -> Result<Vec<WorkflowMacro>, String> {
    let mut list = load_macros();
    list.retain(|m| m.id != id);
    let path = macros_file_path();
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(list)
}

pub fn get_training_stats() -> TrainingStats {
    let path = dpo_file_path();
    let mut pairs = Vec::new();
    let file_size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if let Ok(raw) = fs::read_to_string(&path) {
        for line in raw.lines() {
            if let Ok(p) = serde_json::from_str::<DpoPair>(line) {
                pairs.push(p);
            }
        }
    }
    let pair_count = pairs.len();
    let recent_pairs = pairs.into_iter().rev().take(8).collect();
    TrainingStats {
        pair_count,
        file_path: path.to_string_lossy().to_string(),
        file_size_bytes,
        recent_pairs,
        macros: load_macros(),
    }
}
