//! Tiny JSON persistence (settings, history, queue) in the app data folder.

use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ALLOWED: &[&str] = &["settings", "history", "queue"];

fn file_for(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("Unknown store: {name}"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.json")))
}

pub fn load(app: &AppHandle, name: &str) -> Result<Value, String> {
    let path = file_for(app, name)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or(Value::Null)),
        Err(_) => Ok(Value::Null),
    }
}

pub fn save(app: &AppHandle, name: &str, value: &Value) -> Result<(), String> {
    let path = file_for(app, name)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
