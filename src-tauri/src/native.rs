//! Mobile engine (Android / iOS): pure Rust, no external programs.
//! Uses rusty_ytdl for YouTube metadata, search and playlists, and downloads
//! the media itself with ranged HTTP requests (resumable from a .part file).
//!
//! Limits (no ffmpeg on mobile): video = YouTube's combined audio+video
//! streams (usually up to 360p); audio = original M4A/WebM (no MP3 conversion).

use crate::models::*;
use crate::util::sanitize_filename;
use rusty_ytdl::search::{Playlist, PlaylistSearchOptions, SearchOptions, SearchResult, SearchType, YouTube};
use rusty_ytdl::{Video, VideoFormat};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const CHUNK: u64 = 8 * 1024 * 1024;

pub fn status(app: &AppHandle) -> EngineStatus {
    EngineStatus {
        engine: "native".into(),
        platform: std::env::consts::OS.into(),
        ytdlp: false,
        ffmpeg: false,
        version: Some(format!("rusty_ytdl {}", "0.7")),
        app_version: app.package_info().version.to_string(),
    }
}

fn best_thumb(list: &[rusty_ytdl::Thumbnail]) -> String {
    list.iter().max_by_key(|t| t.width).map(|t| t.url.clone()).unwrap_or_default()
}

fn content_len(f: &VideoFormat, duration: f64) -> (u64, bool) {
    if let Some(n) = f.content_length.as_deref().and_then(|x| x.parse::<u64>().ok()) {
        return (n, false);
    }
    let br = f.average_bitrate.unwrap_or(f.bitrate) as f64;
    ((br * duration / 8.0) as u64, true)
}

fn is_plain(f: &VideoFormat) -> bool {
    !f.url.is_empty() && !f.is_hls && !f.is_dash_mpd
}

fn map_err(e: rusty_ytdl::VideoError) -> String {
    match e {
        rusty_ytdl::VideoError::VideoNotFound => {
            "On mobile only YouTube links are supported for now. Paste a YouTube video or playlist link.".into()
        }
        other => format!("YouTube: {other}"),
    }
}

pub async fn get_info(url: &str) -> Result<MediaInfo, String> {
    let link = url.trim();
    if link.is_empty() {
        return Err("Please paste a link first.".into());
    }
    if Playlist::is_playlist(link) && !link.contains("watch?v=") {
        let opts = PlaylistSearchOptions { limit: 300, fetch_all: true, ..Default::default() };
        let pl = Playlist::get(link, Some(&opts)).await.map_err(map_err)?;
        let entries: Vec<Entry> = pl
            .videos
            .iter()
            .map(|v| Entry {
                id: v.id.clone(),
                title: v.title.clone(),
                duration: Some(v.duration as f64 / 1000.0).filter(|d| *d > 0.0),
                url: v.url.clone(),
                thumbnail: best_thumb(&v.thumbnails),
                channel: v.channel.name.clone(),
            })
            .collect();
        return Ok(MediaInfo::Playlist {
            title: pl.name.clone(),
            thumbnail: entries.first().map(|e| e.thumbnail.clone()).unwrap_or_else(|| best_thumb(&pl.thumbnails)),
            is_channel: false,
            entries,
        });
    }

    let video = Video::new(link).map_err(map_err)?;
    let info = video.get_info().await.map_err(map_err)?;
    let d = &info.video_details;
    let duration: f64 = d.length_seconds.parse().unwrap_or(0.0);

    let mut by_height: BTreeMap<i64, VideoOption> = BTreeMap::new();
    let mut audio: BTreeMap<u32, AudioOption> = BTreeMap::new();
    for f in info.formats.iter().filter(|f| is_plain(f)) {
        let (size, approx) = content_len(f, duration);
        if f.has_video && f.has_audio {
            let h = f.height.unwrap_or(0) as i64;
            if h <= 0 {
                continue;
            }
            let mp4 = f.mime_type.container == "mp4";
            let replace = match by_height.get(&h) {
                None => true,
                Some(cur) => mp4 && cur.format_id.as_deref() != Some(&f.itag.to_string()),
            };
            if replace {
                by_height.insert(
                    h,
                    VideoOption {
                        height: h,
                        label: format!("{h}p"),
                        size,
                        approx,
                        format_id: Some(f.itag.to_string()),
                    },
                );
            }
        } else if f.has_audio && !f.has_video {
            let kbps = (f.average_bitrate.unwrap_or(f.bitrate) / 1000) as u32;
            let ext = if f.mime_type.container == "mp4" { "m4a".to_string() } else { f.mime_type.container.clone() };
            audio.insert(kbps, AudioOption { format_id: f.itag.to_string(), bitrate: kbps, ext, size });
        }
    }

    Ok(MediaInfo::Video {
        id: d.video_id.clone(),
        url: d.video_url.clone(),
        title: d.title.clone(),
        thumbnail: best_thumb(&d.thumbnails),
        duration: Some(duration).filter(|x| *x > 0.0),
        uploader: d.owner_channel_name.clone(),
        is_live: d.is_live_content,
        chapters: d.chapters.len(),
        site: "Youtube".into(),
        video_options: by_height.into_values().rev().collect(),
        audio_options: audio.into_values().rev().take(4).collect(),
        subtitle_options: vec![],
    })
}

pub async fn search(query: &str, limit: u32) -> Result<Vec<Entry>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("Type something to search for.".into());
    }
    let yt = YouTube::new().map_err(map_err)?;
    let opts = SearchOptions { limit: limit.clamp(1, 50) as u64, search_type: SearchType::Video, safe_search: false };
    let res = yt.search(q, Some(&opts)).await.map_err(map_err)?;
    Ok(res
        .into_iter()
        .filter_map(|r| match r {
            SearchResult::Video(v) => Some(Entry {
                id: v.id.clone(),
                title: v.title.clone(),
                duration: Some(v.duration as f64 / 1000.0).filter(|d| *d > 0.0),
                url: v.url.clone(),
                thumbnail: best_thumb(&v.thumbnails),
                channel: v.channel.name.clone(),
            }),
            _ => None,
        })
        .collect())
}

fn fmt_speed(bps: f64) -> String {
    let units = ["B/s", "KiB/s", "MiB/s", "GiB/s"];
    let mut v = bps;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    format!("{v:.1}{}", units[i])
}

fn fmt_eta(secs: f64) -> String {
    if !secs.is_finite() || secs <= 0.0 {
        return String::new();
    }
    let s = secs as u64;
    if s >= 3600 {
        format!("{}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60)
    } else {
        format!("{:02}:{:02}", s / 60, s % 60)
    }
}

/// Pick the format for a download: the requested itag, else the best match.
fn choose(formats: &[VideoFormat], p: &DownloadParams) -> Option<VideoFormat> {
    let plain: Vec<&VideoFormat> = formats.iter().filter(|f| is_plain(f)).collect();
    if let Some(id) = p.format_id.as_deref() {
        if let Some(f) = plain.iter().find(|f| f.itag.to_string() == id) {
            return Some((*f).clone());
        }
    }
    if p.mode == "audio" {
        plain.into_iter().filter(|f| f.has_audio && !f.has_video).max_by_key(|f| f.bitrate).cloned()
    } else {
        let max_h = p.height.filter(|h| *h > 0).unwrap_or(i64::MAX) as u64;
        plain
            .into_iter()
            .filter(|f| f.has_audio && f.has_video && f.height.unwrap_or(0) <= max_h)
            .max_by_key(|f| (f.height.unwrap_or(0), f.bitrate))
            .cloned()
    }
}

pub async fn start_download(
    app: AppHandle,
    jobs: Arc<Mutex<HashMap<String, Arc<JobCtl>>>>,
    ctl: Arc<JobCtl>,
    p: DownloadParams,
) -> Result<(), String> {
    let video = Video::new(p.url.trim()).map_err(map_err)?;
    let info = video.get_info().await.map_err(map_err)?;
    let format = choose(&info.formats, &p).ok_or("No downloadable stream was found for this video.")?;
    let ext = if p.mode == "audio" {
        if format.mime_type.container == "mp4" { "m4a".to_string() } else { format.mime_type.container.clone() }
    } else {
        format.mime_type.container.clone()
    };
    let title = sanitize_filename(&info.video_details.title);
    let name = match (p.name_template.as_deref(), p.playlist_index) {
        (Some("index-title"), Some(i)) => format!("{i:02} - {title}.{ext}"),
        (Some("title-quality"), _) if p.mode != "audio" => {
            format!("{title} [{}p].{ext}", format.height.unwrap_or(0))
        }
        _ => format!("{title}.{ext}"),
    };
    let dir = PathBuf::from(&p.out_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot use the download folder: {e}"))?;
    let final_path = dir.join(&name);
    let part_path = dir.join(format!("{name}.part"));
    let total = format.content_length.as_deref().and_then(|x| x.parse::<u64>().ok());

    let id = p.id.clone();
    if let Some(reason) = ctl.stop_reason() {
        // Paused/cancelled while the video info was being fetched.
        jobs.lock().unwrap().remove(&id);
        let _ = app.emit(PROGRESS_EVENT, Progress { id, status: reason.into(), ..Default::default() });
        return Ok(());
    }

    tauri::async_runtime::spawn(async move {
        let emit = |pr: Progress| {
            let _ = app.emit(PROGRESS_EVENT, pr);
        };
        let result = run_transfer(&format.url, total, &part_path, &ctl, &id, &emit).await;
        jobs.lock().unwrap().remove(&id);
        let mut pr = Progress { id: id.clone(), ..Default::default() };
        match (ctl.stop_reason(), result) {
            (Some(reason), Ok(pct)) | (Some(reason), Err((_, pct))) => {
                pr.status = reason.into();
                if reason == "cancelled" {
                    let _ = std::fs::remove_file(&part_path);
                } else {
                    pr.percent = pct;
                    pr.partials = vec![final_path.to_string_lossy().into_owned()];
                }
            }
            (None, Ok(_)) => match std::fs::rename(&part_path, &final_path) {
                Ok(()) => {
                    pr.status = "done".into();
                    pr.percent = 100.0;
                    pr.size_bytes = std::fs::metadata(&final_path).ok().map(|m| m.len());
                    pr.file_path = Some(final_path.to_string_lossy().into_owned());
                }
                Err(e) => {
                    pr.status = "error".into();
                    pr.error = Some(format!("Could not save the file: {e}"));
                }
            },
            (None, Err((e, _))) => {
                pr.status = "error".into();
                pr.error = Some(e);
            }
        }
        emit(pr);
    });
    Ok(())
}

/// Download `url` into `part` with ranged requests, resuming from the
/// existing part file. Returns the last percentage.
async fn run_transfer(
    url: &str,
    total: Option<u64>,
    part: &PathBuf,
    ctl: &JobCtl,
    id: &str,
    emit: &(dyn Fn(Progress) + Sync),
) -> Result<f64, (String, f64)> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| (e.to_string(), 0.0))?;

    let mut done = std::fs::metadata(part).map(|m| m.len()).unwrap_or(0);
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(part)
        .await
        .map_err(|e| (format!("Cannot write file: {e}"), 0.0))?;

    let pct = |d: u64| total.map(|t| if t > 0 { d as f64 * 100.0 / t as f64 } else { 0.0 }).unwrap_or(0.0);
    let started = Instant::now();
    let start_bytes = done;
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    loop {
        if ctl.stop_reason().is_some() {
            return Ok(pct(done));
        }
        if let Some(t) = total {
            if done >= t {
                break;
            }
        }
        let end = match total {
            Some(t) => (done + CHUNK - 1).min(t - 1),
            None => done + CHUNK - 1,
        };
        let mut resp = client
            .get(url)
            .header(reqwest::header::RANGE, format!("bytes={done}-{end}"))
            .send()
            .await
            .map_err(|e| (format!("Network error: {e}"), pct(done)))?;
        let status = resp.status();
        if status.as_u16() == 416 {
            break; // already complete
        }
        if !status.is_success() {
            return Err((format!("Download failed (HTTP {status}). Try again."), pct(done)));
        }
        let mut got = 0u64;
        loop {
            let chunk = tokio::select! {
                c = resp.chunk() => c.map_err(|e| (format!("Network error: {e}"), pct(done)))?,
                _ = ctl.notify.notified() => None,
            };
            if ctl.stop_reason().is_some() {
                let _ = file.flush().await;
                return Ok(pct(done));
            }
            let Some(bytes) = chunk else { break };
            file.write_all(&bytes).await.map_err(|e| (format!("Cannot write file: {e}"), pct(done)))?;
            got += bytes.len() as u64;
            done += bytes.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(300) {
                last_emit = Instant::now();
                let secs = started.elapsed().as_secs_f64().max(0.001);
                let bps = (done - start_bytes) as f64 / secs;
                let eta = total.map(|t| fmt_eta((t.saturating_sub(done)) as f64 / bps.max(1.0))).unwrap_or_default();
                emit(Progress {
                    id: id.to_string(),
                    status: "downloading".into(),
                    percent: pct(done),
                    speed: fmt_speed(bps),
                    eta,
                    downloaded: Some(done),
                    total,
                    ..Default::default()
                });
            }
        }
        if got == 0 || (total.is_none() && got < CHUNK) {
            break;
        }
    }
    file.flush().await.map_err(|e| (e.to_string(), pct(done)))?;
    Ok(100.0)
}
