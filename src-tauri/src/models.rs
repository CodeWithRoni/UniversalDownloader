//! Data shapes shared between the Rust engines and the React UI.
//! Everything is serialized camelCase for JavaScript.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tokio::sync::Notify;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOption {
    /// Target height (e.g. 1080). -1 = "best the site offers".
    pub height: i64,
    pub label: String,
    /// Estimated size in bytes (0 = unknown).
    pub size: u64,
    /// The size is an estimate.
    pub approx: bool,
    /// Engine-specific format id (native engine: the YouTube itag).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOption {
    pub format_id: String,
    /// Bitrate in kbps.
    pub bitrate: u32,
    pub ext: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleOption {
    pub lang: String,
    /// Display name from the site, if any (the UI localizes the code otherwise).
    pub name: Option<String>,
    pub auto: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub title: String,
    pub duration: Option<f64>,
    pub url: String,
    pub thumbnail: String,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MediaInfo {
    #[serde(rename_all = "camelCase")]
    Video {
        id: String,
        url: String,
        title: String,
        thumbnail: String,
        duration: Option<f64>,
        uploader: String,
        is_live: bool,
        chapters: usize,
        site: String,
        video_options: Vec<VideoOption>,
        audio_options: Vec<AudioOption>,
        subtitle_options: Vec<SubtitleOption>,
    },
    #[serde(rename_all = "camelCase")]
    Playlist {
        title: String,
        thumbnail: String,
        is_channel: bool,
        entries: Vec<Entry>,
    },
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoOptions {
    pub cookies_browser: Option<String>,
    pub playlist_end: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleChoice {
    pub lang: String,
    #[serde(default)]
    pub auto: bool,
    #[serde(default)]
    pub embed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TrimRange {
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadParams {
    pub id: String,
    pub url: String,
    /// "video" or "audio"
    pub mode: String,
    pub height: Option<i64>,
    pub format_id: Option<String>,
    /// MP3 bitrate in kbps (yt-dlp engine).
    pub audio_quality: Option<u32>,
    pub out_dir: String,
    #[allow(dead_code)]
    pub title: Option<String>,
    pub subtitle: Option<SubtitleChoice>,
    #[serde(default)]
    pub embed_tags: bool,
    pub trim: Option<TrimRange>,
    /// "remove" | "mark"
    pub sponsor_block: Option<String>,
    #[serde(default)]
    pub split_chapters: bool,
    #[serde(default)]
    pub live_from_start: bool,
    pub concurrent_fragments: Option<u32>,
    /// e.g. "2M" (yt-dlp --limit-rate syntax)
    pub limit_rate: Option<String>,
    #[serde(default)]
    pub use_archive: bool,
    /// "title" | "title-quality" | "index-title"
    pub name_template: Option<String>,
    pub playlist_index: Option<u32>,
    pub cookies_browser: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub id: String,
    /// downloading | processing | done | error | paused | cancelled
    pub status: String,
    pub percent: f64,
    pub speed: String,
    pub eta: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloaded: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub skipped: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    /// "yt-dlp" (desktop) or "native" (mobile)
    pub engine: String,
    pub platform: String,
    pub ytdlp: bool,
    pub ffmpeg: bool,
    pub version: Option<String>,
    pub app_version: String,
}

/// Control block for one running download (pause / cancel requests).
#[derive(Default)]
pub struct JobCtl {
    pub reason: Mutex<Option<&'static str>>,
    pub notify: Notify,
}

impl JobCtl {
    pub fn stop(&self, reason: &'static str) {
        *self.reason.lock().unwrap() = Some(reason);
        self.notify.notify_one();
    }
    pub fn stop_reason(&self) -> Option<&'static str> {
        *self.reason.lock().unwrap()
    }
}

pub const PROGRESS_EVENT: &str = "download-progress";
