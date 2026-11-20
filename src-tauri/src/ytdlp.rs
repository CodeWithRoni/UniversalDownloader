//! Desktop engine: drives the yt-dlp binary (bundled with the installer, a
//! copy the app downloaded itself, or one on the system PATH — newest first)
//! and uses ffmpeg for merging, MP3 conversion, trimming and subtitles.

use crate::models::*;
use crate::util::{parse_time, strip_ansi};
use regex::Regex;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

const PROGRESS_TAG: &str = "UDPROG|";

// ---------------------------------------------------------------------------
// Binary lookup
// ---------------------------------------------------------------------------

fn exe(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

fn bin_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    // A copy the user installed/updated from inside the app wins.
    if let Ok(d) = app.path().app_data_dir() {
        dirs.push(d.join("bin"));
    }
    // Bundled with the installer.
    if let Ok(r) = app.path().resource_dir() {
        dirs.push(r.join("bin"));
    }
    // Development: scripts/fetch-binaries puts them in resources/bin.
    #[cfg(debug_assertions)]
    dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("resources").join("bin"));
    dirs
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    let mut extra: Vec<PathBuf> = Vec::new();
    // GUI apps on macOS don't inherit the shell PATH (Homebrew lives here).
    if cfg!(target_os = "macos") {
        extra.push("/opt/homebrew/bin".into());
        extra.push("/usr/local/bin".into());
    }
    std::env::split_paths(&paths)
        .chain(extra)
        .map(|d| d.join(name))
        .find(|p| p.is_file())
}

pub fn find_tool(app: &AppHandle, base: &str) -> Option<PathBuf> {
    let name = exe(base);
    bin_dirs(app)
        .into_iter()
        .map(|d| d.join(&name))
        .find(|p| p.is_file())
        .or_else(|| find_on_path(&name))
}

fn ytdlp_or_err(app: &AppHandle) -> Result<PathBuf, String> {
    find_tool(app, "yt-dlp").ok_or_else(|| {
        "yt-dlp was not found. Open Settings → Engine and press \"Install yt-dlp\".".to_string()
    })
}

/// A Command that never flashes a console window on Windows and runs in its
/// own process group on Unix (so a stop also kills ffmpeg helpers).
fn new_command(bin: &Path) -> Command {
    let mut cmd = Command::new(bin);
    cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    cmd
}

async fn tool_version(bin: &Path) -> Option<String> {
    let out = new_command(bin).arg("--version").output().await.ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines().next().map(|l| l.trim().to_string())
}

pub async fn status(app: &AppHandle) -> EngineStatus {
    let yt = find_tool(app, "yt-dlp");
    let ff = find_tool(app, "ffmpeg");
    let version = match &yt {
        Some(p) => tool_version(p).await,
        None => None,
    };
    EngineStatus {
        engine: "yt-dlp".into(),
        platform: std::env::consts::OS.into(),
        ytdlp: yt.is_some(),
        ffmpeg: ff.is_some(),
        version,
        app_version: app.package_info().version.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

async fn run_json_once(bin: &Path, args: &[String]) -> Result<Value, String> {
    let out = new_command(bin)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Could not run yt-dlp: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: Vec<&str> = err.trim().lines().rev().take(3).collect();
        let tail: Vec<&str> = tail.into_iter().rev().collect();
        return Err(format!("yt-dlp: {}", tail.join(" ")));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("Could not read video info: {e}"))
}

/// If YouTube blocks the default client ("Sign in to confirm you're not a
/// bot"), retry once with alternate player clients.
async fn run_json(bin: &Path, args: Vec<String>) -> Result<Value, String> {
    match run_json_once(bin, &args).await {
        Ok(v) => Ok(v),
        Err(first) => {
            let mut retry = args.clone();
            let url = retry.pop();
            retry.extend([
                "--extractor-args".to_string(),
                "youtube:player_client=web_safari,ios,android_vr,tv".to_string(),
                "--ignore-no-formats-error".to_string(),
            ]);
            if let Some(u) = url {
                retry.push(u);
            }
            run_json_once(bin, &retry).await.map_err(|_| {
                format!("{first} — if YouTube keeps blocking, try again later or from another network.")
            })
        }
    }
}

fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn f(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn last_thumb(v: &Value) -> String {
    v.get("thumbnails")
        .and_then(Value::as_array)
        .and_then(|a| a.last())
        .map(|t| s(t, "url"))
        .unwrap_or_default()
}

fn entry_url(e: &Value, id: &str) -> String {
    let u = s(e, "url");
    if u.starts_with("http") {
        u
    } else {
        format!("https://www.youtube.com/watch?v={id}")
    }
}

fn parse_entry(e: &Value) -> Option<Entry> {
    let id = s(e, "id");
    if id.is_empty() {
        return None;
    }
    let title = s(e, "title");
    Some(Entry {
        url: entry_url(e, &id),
        title: if title.is_empty() { "Untitled video".into() } else { title },
        duration: f(e, "duration"),
        thumbnail: last_thumb(e),
        channel: {
            let c = s(e, "channel");
            if c.is_empty() { s(e, "uploader") } else { c }
        },
        id,
    })
}

fn parse_playlist(data: &Value, is_channel: bool) -> MediaInfo {
    let entries: Vec<Entry> = data
        .get("entries")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(parse_entry).collect())
        .unwrap_or_default();
    let thumbnail = entries.iter().map(|e| e.thumbnail.clone()).find(|t| !t.is_empty()).unwrap_or_default();
    let title = s(data, "title");
    MediaInfo::Playlist {
        title: if title.is_empty() { "Playlist".into() } else { title },
        thumbnail,
        is_channel,
        entries,
    }
}

fn parse_subtitles(data: &Value) -> Vec<SubtitleOption> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    if let Some(manual) = data.get("subtitles").and_then(Value::as_object) {
        for (lang, fmts) in manual {
            if lang == "live_chat" {
                continue;
            }
            let name = fmts
                .as_array()
                .and_then(|a| a.first())
                .and_then(|x| x.get("name"))
                .and_then(Value::as_str)
                .map(String::from);
            out.push(SubtitleOption { lang: lang.clone(), name, auto: false });
            seen.insert(lang.clone());
        }
    }
    let priority = ["bn", "en", "hi", "ur", "ar", "es", "fr", "de", "id", "ms"];
    if let Some(auto) = data.get("automatic_captions").and_then(Value::as_object) {
        let mut langs: Vec<&String> = auto.keys().filter(|l| !seen.contains(*l)).collect();
        langs.sort_by_key(|l| {
            let p = priority.iter().position(|x| x == l).unwrap_or(99);
            (p, (*l).clone())
        });
        for lang in langs.into_iter().take(40) {
            out.push(SubtitleOption { lang: lang.clone(), name: None, auto: true });
        }
    }
    out
}

fn height_label(h: i64) -> String {
    let tag = match h {
        h if h >= 4320 => " · 8K",
        h if h >= 2160 => " · 4K",
        h if h >= 1440 => " · 2K",
        h if h >= 1080 => " · Full HD",
        h if h >= 720 => " · HD",
        _ => "",
    };
    format!("{h}p{tag}")
}

fn parse_video(data: &Value, url: &str) -> MediaInfo {
    let empty = Vec::new();
    let formats = data.get("formats").and_then(Value::as_array).unwrap_or(&empty);

    let size_of = |fm: &Value| f(fm, "filesize").or_else(|| f(fm, "filesize_approx")).unwrap_or(0.0) as u64;

    // Audio-only formats: best size (for merged estimates) + options by bitrate.
    let mut best_audio = 0u64;
    let mut audio: BTreeMap<u32, AudioOption> = BTreeMap::new();
    for fm in formats {
        let acodec = s(fm, "acodec");
        let vcodec = s(fm, "vcodec");
        if acodec == "none" || acodec.is_empty() && vcodec.is_empty() {
            continue;
        }
        if vcodec == "none" {
            let size = size_of(fm);
            best_audio = best_audio.max(size);
            let abr = f(fm, "abr").unwrap_or(0.0).round() as u32;
            if abr > 0 {
                audio.insert(
                    abr,
                    AudioOption { format_id: s(fm, "format_id"), bitrate: abr, ext: s(fm, "ext"), size },
                );
            }
        }
    }
    let audio_options: Vec<AudioOption> = audio.into_values().rev().take(4).collect();

    // Video options grouped by height (largest per height).
    let mut by_height: BTreeMap<i64, (u64, bool)> = BTreeMap::new();
    for fm in formats {
        let vcodec = s(fm, "vcodec");
        if vcodec == "none" {
            continue;
        }
        let Some(h) = f(fm, "height").filter(|h| *h > 0.0) else { continue };
        let h = h as i64;
        let exact = f(fm, "filesize");
        let size_v = size_of(fm);
        let total = if s(fm, "acodec") == "none" { size_v + best_audio } else { size_v };
        let entry = by_height.entry(h).or_insert((0, true));
        if total >= entry.0 {
            *entry = (total, exact.is_none());
        }
    }
    let mut video_options: Vec<VideoOption> = by_height
        .into_iter()
        .rev()
        .map(|(h, (size, approx))| VideoOption { height: h, label: height_label(h), size, approx, format_id: None })
        .collect();
    if video_options.is_empty() && audio_options.is_empty() {
        video_options.push(VideoOption {
            height: -1,
            label: "Best quality".into(),
            size: 0,
            approx: true,
            format_id: None,
        });
    }

    let title = s(data, "title");
    let uploader = {
        let u = s(data, "uploader");
        if u.is_empty() { s(data, "channel") } else { u }
    };
    let page = s(data, "webpage_url");
    MediaInfo::Video {
        id: s(data, "id"),
        url: if page.is_empty() { url.to_string() } else { page },
        title: if title.is_empty() { "Untitled video".into() } else { title },
        thumbnail: s(data, "thumbnail"),
        duration: f(data, "duration"),
        uploader,
        is_live: data.get("is_live").and_then(Value::as_bool).unwrap_or(false),
        chapters: data.get("chapters").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0),
        site: s(data, "extractor_key"),
        video_options,
        audio_options,
        subtitle_options: parse_subtitles(data),
    }
}

fn cookie_args(browser: &Option<String>) -> Vec<String> {
    match browser.as_deref().map(str::trim) {
        Some(b) if !b.is_empty() => vec!["--cookies-from-browser".into(), b.into()],
        _ => vec![],
    }
}

pub async fn get_info(app: &AppHandle, url: &str, opts: InfoOptions) -> Result<MediaInfo, String> {
    let link = url.trim().to_string();
    if link.is_empty() {
        return Err("Please paste a link first.".into());
    }
    let bin = ytdlp_or_err(app)?;
    let cookies = cookie_args(&opts.cookies_browser);

    // Channel link → its newest N videos.
    let channel_re = Regex::new(r"youtube\.com/(?:@|channel/|c/|user/)").unwrap();
    if channel_re.is_match(&link) && !link.contains("watch?v=") && !link.contains("list=") {
        let base = link.split(['?', '#']).next().unwrap_or(&link).trim_end_matches('/').to_string();
        let tab_re = Regex::new(r"/(videos|shorts|streams)$").unwrap();
        let channel_url = if tab_re.is_match(&base) { base } else { format!("{base}/videos") };
        let limit = opts.playlist_end.filter(|n| *n > 0).unwrap_or(20);
        let mut args: Vec<String> = ["--dump-single-json", "--flat-playlist", "--yes-playlist", "--no-warnings", "--playlist-end"]
            .iter()
            .map(|x| x.to_string())
            .collect();
        args.push(limit.to_string());
        args.extend(cookies.clone());
        args.push(channel_url);
        let data = run_json(&bin, args).await?;
        if s(&data, "_type") == "playlist" {
            return Ok(parse_playlist(&data, true));
        }
    }

    if link.contains("list=") || link.contains("/playlist") || link.contains("/sets/") {
        let mut args: Vec<String> =
            ["--dump-single-json", "--flat-playlist", "--yes-playlist", "--no-warnings"].iter().map(|x| x.to_string()).collect();
        args.extend(cookies.clone());
        args.push(link.clone());
        let data = run_json(&bin, args).await?;
        if s(&data, "_type") == "playlist" {
            return Ok(parse_playlist(&data, false));
        }
    }

    let mut args: Vec<String> = ["--dump-single-json", "--no-playlist", "--no-warnings"].iter().map(|x| x.to_string()).collect();
    args.extend(cookies);
    args.push(link.clone());
    let data = run_json(&bin, args).await?;
    if s(&data, "_type") == "playlist" {
        return Ok(parse_playlist(&data, false));
    }
    Ok(parse_video(&data, &link))
}

pub async fn search(app: &AppHandle, query: &str, limit: u32, cookies_browser: Option<String>) -> Result<Vec<Entry>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("Type something to search for.".into());
    }
    let bin = ytdlp_or_err(app)?;
    let mut args: Vec<String> = vec!["--dump-json".into(), "--flat-playlist".into(), "--no-warnings".into()];
    args.extend(cookie_args(&cookies_browser));
    args.push(format!("ytsearch{}:{}", limit.clamp(1, 50), q));
    let out = new_command(&bin)
        .args(&args)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Could not run yt-dlp: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Search failed: {}", err.trim().lines().last().unwrap_or("")));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        .filter_map(|e| parse_entry(&e))
        .collect())
}

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

pub fn build_args(p: &DownloadParams, ffmpeg: Option<&Path>, archive: Option<&Path>) -> Vec<String> {
    let dir = Path::new(&p.out_dir);
    let video = p.mode != "audio";
    let name_part = match (p.name_template.as_deref(), p.playlist_index) {
        (Some("title-quality"), _) if video => "%(title)s [%(height)sp].%(ext)s".to_string(),
        (Some("index-title"), Some(i)) => format!("{i:02} - %(title)s.%(ext)s"),
        _ => "%(title)s.%(ext)s".to_string(),
    };
    let mut a: Vec<String> = vec![
        "--newline".into(),
        "--no-warnings".into(),
        "--no-playlist".into(),
        "--progress-template".into(),
        format!(
            "download:{PROGRESS_TAG}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s"
        ),
        "-o".into(),
        dir.join(&name_part).to_string_lossy().into_owned(),
    ];
    if p.split_chapters && video {
        a.push("-o".into());
        a.push(format!("chapter:{}", dir.join("%(section_number)02d - %(section_title)s.%(ext)s").to_string_lossy()));
    }
    if let Some(ff) = ffmpeg {
        a.push("--ffmpeg-location".into());
        a.push(ff.to_string_lossy().into_owned());
    }
    if let Some(n) = p.concurrent_fragments.filter(|n| *n >= 2) {
        a.push("--concurrent-fragments".into());
        a.push(n.to_string());
    }
    if let Some(r) = p.limit_rate.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
        a.push("--limit-rate".into());
        a.push(r.to_string());
    }
    if let Some(ar) = archive {
        a.push("--download-archive".into());
        a.push(ar.to_string_lossy().into_owned());
    }
    a.extend(cookie_args(&p.cookies_browser));

    if !video {
        a.push("-f".into());
        a.push(p.format_id.clone().filter(|x| !x.is_empty()).unwrap_or_else(|| "bestaudio/best".into()));
        a.extend(["-x".into(), "--audio-format".into(), "mp3".into(), "--audio-quality".into()]);
        a.push(p.audio_quality.map(|q| format!("{q}K")).unwrap_or_else(|| "0".into()));
        if p.embed_tags {
            a.extend(["--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "jpg"].map(String::from));
        }
    } else {
        let h = p.height.unwrap_or(1080);
        if h == -1 {
            a.extend(["-f".into(), "bestvideo+bestaudio/best".into()]);
        } else {
            a.push("-f".into());
            a.push(format!("bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"));
            a.extend(["--merge-output-format".into(), "mp4".into()]);
        }
        a.push("--embed-metadata".into());
        if let Some(sub) = p.subtitle.as_ref().filter(|s| !s.lang.is_empty()) {
            a.push(if sub.auto { "--write-auto-subs" } else { "--write-subs" }.into());
            a.extend(["--sub-langs".into(), sub.lang.clone()]);
            if sub.embed {
                a.push("--embed-subs".into());
            } else {
                a.extend(["--convert-subs".into(), "srt".into()]);
            }
        }
        if let Some(t) = &p.trim {
            let st = t.start.as_deref().and_then(parse_time);
            let en = t.end.as_deref().and_then(parse_time);
            if st.is_some() || en.is_some() {
                a.push("--download-sections".into());
                a.push(format!("*{}-{}", st.unwrap_or(0), en.map(|e| e.to_string()).unwrap_or_else(|| "inf".into())));
                a.push("--force-keyframes-at-cuts".into());
            }
        }
        match p.sponsor_block.as_deref() {
            Some("remove") => a.extend(["--sponsorblock-remove".into(), "sponsor,intro,outro,selfpromo,preview".into()]),
            Some("mark") => a.extend(["--sponsorblock-mark".into(), "sponsor,intro,outro,selfpromo".into()]),
            _ => {}
        }
        if p.split_chapters {
            a.push("--split-chapters".into());
        }
        if p.live_from_start {
            a.push("--live-from-start".into());
        }
    }
    a
}

fn num(s: &str) -> Option<u64> {
    s.trim().parse::<f64>().ok().filter(|x| x.is_finite() && *x >= 0.0).map(|x| x as u64)
}

/// Parse one progress-template line.
pub fn parse_progress(line: &str) -> Option<(f64, String, String, Option<u64>, Option<u64>)> {
    let rest = line.strip_prefix(PROGRESS_TAG)?;
    let parts: Vec<&str> = rest.split('|').collect();
    let pct = parts.first().map(|p| p.trim().trim_end_matches('%').trim().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0);
    let clean = |s: Option<&&str>| {
        let v = s.map(|x| x.trim()).unwrap_or("");
        if v == "NA" || v == "Unknown" || v.starts_with("Unknown") { String::new() } else { v.to_string() }
    };
    let downloaded = parts.get(3).and_then(|x| num(x));
    let total = parts.get(4).and_then(|x| num(x)).or_else(|| parts.get(5).and_then(|x| num(x)));
    Some((pct, clean(parts.get(1)), clean(parts.get(2)), downloaded, total))
}

async fn kill_tree(child: &mut Child) {
    if let Some(pid) = child.id() {
        #[cfg(windows)]
        {
            let mut k = Command::new("taskkill");
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            k.creation_flags(CREATE_NO_WINDOW);
            let _ = k.args(["/PID", &pid.to_string(), "/T", "/F"]).output().await;
        }
        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    let _ = child.start_kill();
}

pub async fn start_download(
    app: AppHandle,
    jobs: Arc<Mutex<std::collections::HashMap<String, Arc<JobCtl>>>>,
    p: DownloadParams,
) -> Result<(), String> {
    let bin = ytdlp_or_err(&app)?;
    let ffmpeg = find_tool(&app, "ffmpeg");
    let archive = if p.use_archive {
        app.path().app_data_dir().ok().map(|d| d.join("download-archive.txt"))
    } else {
        None
    };
    std::fs::create_dir_all(&p.out_dir).map_err(|e| format!("Cannot use the download folder: {e}"))?;

    let mut args = build_args(&p, ffmpeg.as_deref(), archive.as_deref());
    // "--" so a link can never be read as an option.
    args.push("--".into());
    args.push(p.url.clone());

    let mut child = new_command(&bin)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start download: {e}"))?;

    let id = p.id.clone();
    let ctl = Arc::new(JobCtl::default());
    jobs.lock().unwrap().insert(id.clone(), ctl.clone());

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let last_error = Arc::new(Mutex::new(String::new()));
    {
        let last_error = last_error.clone();
        tauri::async_runtime::spawn(async move {
            let mut r = BufReader::new(stderr);
            let mut buf = Vec::new();
            while let Ok(n) = r.read_until(b'\n', &mut buf).await {
                if n == 0 {
                    break;
                }
                let line = strip_ansi(String::from_utf8_lossy(&buf).trim());
                if line.contains("ERROR") {
                    *last_error.lock().unwrap() = line.replace("ERROR: ", "");
                }
                buf.clear();
            }
        });
    }

    tauri::async_runtime::spawn(async move {
        let dest_re = Regex::new(r"^\[download\] Destination: (.+)$").unwrap();
        let merge_re = Regex::new(r#"^\[Merger\] Merging formats into "(.+)"$"#).unwrap();
        let audio_re = Regex::new(r"^\[ExtractAudio\] Destination: (.+)$").unwrap();
        let already_re = Regex::new(r"^\[download\] (.+) has already been downloaded").unwrap();

        let emit = |pr: Progress| {
            let _ = app.emit(PROGRESS_EVENT, pr);
        };
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        let mut last_dest: Option<String> = None;
        let mut final_path: Option<String> = None;
        let mut last_pct = 0.0;
        let mut skipped = false;
        let mut stopped = false;

        loop {
            tokio::select! {
                _ = ctl.notify.notified() => {
                    kill_tree(&mut child).await;
                    stopped = true;
                    break;
                }
                r = reader.read_until(b'\n', &mut buf) => {
                    match r {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let line = strip_ansi(String::from_utf8_lossy(&buf).trim());
                            buf.clear();
                            if let Some(c) = dest_re.captures(&line) {
                                last_dest = Some(c[1].trim().to_string());
                            } else if let Some(c) = merge_re.captures(&line) {
                                final_path = Some(c[1].to_string());
                            } else if let Some(c) = audio_re.captures(&line) {
                                final_path = Some(c[1].trim().to_string());
                            } else if let Some(c) = already_re.captures(&line) {
                                final_path = Some(c[1].trim().to_string());
                            } else if line.contains("has already been recorded in the archive") {
                                skipped = true;
                            }
                            if let Some((pct, speed, eta, downloaded, total)) = parse_progress(&line) {
                                last_pct = pct;
                                emit(Progress { id: id.clone(), status: "downloading".into(), percent: pct, speed, eta, downloaded, total, ..Default::default() });
                            } else if line.starts_with("[Merger]") || line.starts_with("[ExtractAudio]")
                                || line.starts_with("[EmbedSubtitle]") || line.starts_with("[Metadata]")
                                || line.starts_with("[SponsorBlock]") || line.starts_with("[ModifyChapters]")
                                || line.starts_with("[EmbedThumbnail]") || line.starts_with("[SplitChapters]") {
                                emit(Progress { id: id.clone(), status: "processing".into(), percent: 100.0, ..Default::default() });
                            }
                        }
                    }
                }
            }
        }

        let code = if stopped {
            let _ = child.wait().await;
            None
        } else {
            tokio::select! {
                s = child.wait() => s.ok().and_then(|s| s.code()),
                _ = ctl.notify.notified() => {
                    kill_tree(&mut child).await;
                    let _ = child.wait().await;
                    None
                }
            }
        };

        jobs.lock().unwrap().remove(&id);
        let mut pr = Progress { id: id.clone(), ..Default::default() };
        if let Some(reason) = ctl.stop_reason() {
            pr.status = reason.into();
            pr.percent = if reason == "paused" { last_pct } else { 0.0 };
        } else if code == Some(0) {
            pr.status = "done".into();
            pr.percent = 100.0;
            pr.skipped = skipped;
            if let Some(path) = final_path.or(last_dest) {
                pr.size_bytes = std::fs::metadata(&path).ok().map(|m| m.len());
                pr.file_path = Some(path);
            }
        } else {
            pr.status = "error".into();
            let e = last_error.lock().unwrap().clone();
            pr.error = Some(if e.is_empty() { "Download failed".into() } else { e });
        }
        emit(pr);
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Install / update yt-dlp from inside the app
// ---------------------------------------------------------------------------

pub async fn install_ytdlp(app: &AppHandle) -> Result<String, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let asset = if cfg!(windows) {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else if cfg!(target_arch = "aarch64") {
        "yt-dlp_linux_aarch64"
    } else {
        "yt-dlp_linux"
    };
    let url = format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset}");
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("bin");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(exe("yt-dlp"));
    let tmp = dir.join(format!("{}.download", exe("yt-dlp")));

    let client = reqwest::Client::builder().user_agent("Universal-Downloader").build().map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Downloading yt-dlp failed — check your internet connection. ({e})"))?;
    if !resp.status().is_success() {
        return Err(format!("Downloading yt-dlp failed (HTTP {}).", resp.status()));
    }
    let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(tool_version(&dest).await.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_line() {
        let (p, sp, eta, d, t) = parse_progress("UDPROG| 42.5%|1.20MiB/s|00:10|1000|NA|5000").unwrap();
        assert_eq!(p, 42.5);
        assert_eq!(sp, "1.20MiB/s");
        assert_eq!(eta, "00:10");
        assert_eq!(d, Some(1000));
        assert_eq!(t, Some(5000));
    }

    #[test]
    fn parse_formats() {
        let data: Value = serde_json::from_str(
            r#"{"id":"x","title":"T","formats":[
              {"format_id":"140","acodec":"mp4a","vcodec":"none","abr":129.5,"filesize":1000,"ext":"m4a"},
              {"format_id":"137","acodec":"none","vcodec":"avc1","height":1080,"filesize":9000},
              {"format_id":"18","acodec":"mp4a","vcodec":"avc1","height":360,"filesize_approx":3000}
            ]}"#,
        )
        .unwrap();
        match parse_video(&data, "u") {
            MediaInfo::Video { video_options, audio_options, .. } => {
                assert_eq!(video_options[0].height, 1080);
                assert_eq!(video_options[0].size, 10000);
                assert!(!video_options[0].approx);
                assert!(video_options[1].approx);
                assert_eq!(audio_options[0].bitrate, 130);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn audio_args() {
        let p: DownloadParams = serde_json::from_value(serde_json::json!({
            "id":"1","url":"u","mode":"audio","outDir":"/tmp/x","audioQuality":192,"embedTags":true
        }))
        .unwrap();
        let a = build_args(&p, None, None);
        assert!(a.windows(2).any(|w| w[0] == "--audio-quality" && w[1] == "192K"));
        assert!(a.contains(&"--embed-thumbnail".to_string()));
    }
}
