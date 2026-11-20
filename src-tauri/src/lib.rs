//! Universal Downloader — Tauri 2 app core.
//!
//! Desktop (Windows / macOS / Linux): the yt-dlp + ffmpeg engine (`ytdlp`).
//! Mobile (Android / iOS): the pure-Rust YouTube engine (`native`).

mod models;
mod store;
mod util;

#[cfg(desktop)]
mod ytdlp;

#[cfg(native_engine)]
#[cfg_attr(desktop, allow(dead_code))]
mod native;

use models::*;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, Arc<JobCtl>>>>,
}

#[tauri::command]
async fn engine_status(app: AppHandle) -> EngineStatus {
    #[cfg(desktop)]
    return ytdlp::status(&app).await;
    #[cfg(mobile)]
    return native::status(&app);
}

#[tauri::command]
async fn install_ytdlp(app: AppHandle) -> Result<String, String> {
    #[cfg(desktop)]
    return ytdlp::install_ytdlp(&app).await;
    #[cfg(mobile)]
    {
        let _ = app;
        Err("yt-dlp is not used on mobile.".into())
    }
}

#[tauri::command]
async fn get_info(app: AppHandle, url: String, opts: Option<InfoOptions>) -> Result<MediaInfo, String> {
    #[cfg(desktop)]
    return ytdlp::get_info(&app, &url, opts.unwrap_or_default()).await;
    #[cfg(mobile)]
    {
        let _ = (app, opts);
        native::get_info(&url).await
    }
}

#[tauri::command]
async fn search_videos(
    app: AppHandle,
    query: String,
    limit: Option<u32>,
    cookies_browser: Option<String>,
) -> Result<Vec<Entry>, String> {
    let limit = limit.unwrap_or(12);
    #[cfg(desktop)]
    return ytdlp::search(&app, &query, limit, cookies_browser).await;
    #[cfg(mobile)]
    {
        let _ = (app, cookies_browser);
        native::search(&query, limit).await
    }
}

#[tauri::command]
async fn start_download(app: AppHandle, state: State<'_, AppState>, params: DownloadParams) -> Result<(), String> {
    // Register first: Pause/Cancel pressed while the engine is still
    // preparing (fetching info, starting yt-dlp) must not get lost.
    let jobs = state.jobs.clone();
    let ctl = Arc::new(JobCtl::default());
    jobs.lock().unwrap().insert(params.id.clone(), ctl.clone());
    #[cfg(desktop)]
    let result = ytdlp::start_download(app, jobs.clone(), ctl, params.clone()).await;
    #[cfg(mobile)]
    let result = native::start_download(app, jobs.clone(), ctl, params.clone()).await;
    if result.is_err() {
        jobs.lock().unwrap().remove(&params.id);
    }
    result
}

fn stop(state: &AppState, id: &str, reason: &'static str) {
    if let Some(ctl) = state.jobs.lock().unwrap().get(id) {
        ctl.stop(reason);
    }
}

#[tauri::command]
fn pause_download(state: State<'_, AppState>, id: String) {
    stop(&state, &id, "paused");
}

#[tauri::command]
fn cancel_download(state: State<'_, AppState>, id: String) {
    stop(&state, &id, "cancelled");
}

/// Delete the `.part` pieces of a paused download the user cancelled.
#[tauri::command]
fn discard_partials(paths: Vec<String>) {
    for d in &paths {
        let _ = std::fs::remove_file(format!("{d}.part"));
        let _ = std::fs::remove_file(format!("{d}.ytdl"));
    }
    #[cfg(desktop)]
    ytdlp::remove_partials(&paths);
}

#[tauri::command]
fn default_download_dir(app: AppHandle) -> String {
    #[cfg(target_os = "android")]
    {
        let public = std::path::PathBuf::from("/storage/emulated/0/Download/Universal Downloader");
        if std::fs::create_dir_all(&public).is_ok() {
            return public.to_string_lossy().into_owned();
        }
    }
    #[cfg(mobile)]
    {
        if let Ok(d) = app.path().document_dir() {
            return d.join("Universal Downloader").to_string_lossy().into_owned();
        }
    }
    let base = app.path().download_dir().or_else(|_| app.path().home_dir()).unwrap_or_default();
    base.join("Universal Downloader").to_string_lossy().into_owned()
}

#[tauri::command]
fn load_json(app: AppHandle, name: String) -> Result<Value, String> {
    store::load(&app, &name)
}

#[tauri::command]
fn save_json(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    store::save(&app, &name, &value)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            engine_status,
            install_ytdlp,
            get_info,
            search_videos,
            start_download,
            pause_download,
            cancel_download,
            discard_partials,
            default_download_dir,
            load_json,
            save_json,
            path_exists,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Universal Downloader");
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Universal Downloader");
}
