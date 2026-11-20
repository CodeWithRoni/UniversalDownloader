// Bridge to the Rust backend (Tauri commands). In a plain browser (web
// preview) there is no backend, so a small demo engine fakes the responses.

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let core = null
let eventApi = null
async function tauriCore() {
  if (!core) core = await import('@tauri-apps/api/core')
  return core
}
async function call(cmd, args) {
  const { invoke } = await tauriCore()
  try {
    return await invoke(cmd, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e?.message || String(e))
  }
}

// ---------------------------------------------------------------------------
// Demo engine (browser only)
// ---------------------------------------------------------------------------
const demoListeners = new Set()
const demoTimers = new Map()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const DEMO_THUMB = 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg'

const demo = {
  async engineStatus() {
    return { engine: 'demo', platform: 'web', ytdlp: true, ffmpeg: true, version: 'demo', appVersion: '2.0.0' }
  },
  async getInfo(url) {
    await wait(700)
    if (url.includes('list=')) {
      return {
        kind: 'playlist',
        title: 'Demo playlist — Open movies',
        thumbnail: DEMO_THUMB,
        isChannel: false,
        entries: Array.from({ length: 8 }, (_, i) => ({
          id: `demo${i}`,
          title: `Open movie part ${i + 1}`,
          duration: 180 + i * 47,
          url: `https://www.youtube.com/watch?v=demo${i}`,
          thumbnail: DEMO_THUMB,
          channel: 'Blender Studio',
        })),
      }
    }
    return {
      kind: 'video',
      id: 'aqz-KE-bpKQ',
      url,
      title: 'Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film',
      thumbnail: DEMO_THUMB,
      duration: 635,
      uploader: 'Blender',
      isLive: false,
      chapters: 0,
      site: 'Youtube',
      videoOptions: [
        { height: 2160, label: '2160p · 4K', size: 1_210_000_000, approx: true },
        { height: 1440, label: '1440p · 2K', size: 640_000_000, approx: true },
        { height: 1080, label: '1080p · Full HD', size: 310_000_000, approx: false },
        { height: 720, label: '720p · HD', size: 142_000_000, approx: false },
        { height: 480, label: '480p', size: 71_000_000, approx: false },
        { height: 360, label: '360p', size: 44_000_000, approx: false },
      ],
      audioOptions: [
        { formatId: '251', bitrate: 160, ext: 'webm', size: 11_000_000 },
        { formatId: '140', bitrate: 129, ext: 'm4a', size: 10_200_000 },
      ],
      subtitleOptions: [
        { lang: 'en', name: 'English', auto: false },
        { lang: 'bn', name: null, auto: true },
      ],
    }
  },
  async searchVideos(query) {
    await wait(600)
    return Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      title: `${query} — result ${i + 1}`,
      duration: 200 + i * 33,
      url: `https://www.youtube.com/watch?v=s${i}`,
      thumbnail: DEMO_THUMB,
      channel: 'Demo channel',
    }))
  },
  async startDownload(params) {
    let pct = params.__resumeFrom || 0
    const total = 120_000_000
    const t = setInterval(() => {
      pct = Math.min(100, pct + 3 + Math.random() * 5)
      const ev = {
        id: params.id,
        status: pct >= 100 ? 'done' : 'downloading',
        percent: pct,
        speed: `${(4 + Math.random() * 6).toFixed(1)}MiB/s`,
        eta: `00:${String(Math.max(0, Math.round((100 - pct) / 4))).padStart(2, '0')}`,
        downloaded: Math.round((total * pct) / 100),
        total,
      }
      if (pct >= 100) {
        clearInterval(t)
        demoTimers.delete(params.id)
        ev.filePath = `${params.outDir}/demo.${params.mode === 'audio' ? 'mp3' : 'mp4'}`
        ev.sizeBytes = total
      }
      demoListeners.forEach((cb) => cb(ev))
    }, 400)
    demoTimers.set(params.id, { t, get pct() { return pct } })
  },
  stop(id, status) {
    const j = demoTimers.get(id)
    if (!j) return
    clearInterval(j.t)
    demoTimers.delete(id)
    demoListeners.forEach((cb) => cb({ id, status, percent: status === 'paused' ? j.pct : 0, speed: '', eta: '' }))
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const api = {
  engineStatus: () => (isTauri ? call('engine_status') : demo.engineStatus()),
  installYtdlp: () => (isTauri ? call('install_ytdlp') : wait(800).then(() => 'demo')),
  getInfo: (url, opts) => (isTauri ? call('get_info', { url, opts }) : demo.getInfo(url)),
  searchVideos: (query, limit, cookiesBrowser) =>
    isTauri ? call('search_videos', { query, limit, cookiesBrowser: cookiesBrowser || null }) : demo.searchVideos(query),
  startDownload: (params) => (isTauri ? call('start_download', { params }) : demo.startDownload(params)),
  pauseDownload: (id) => (isTauri ? call('pause_download', { id }) : demo.stop(id, 'paused')),
  cancelDownload: (id) => (isTauri ? call('cancel_download', { id }) : demo.stop(id, 'cancelled')),
  discardPartials: (paths) => (isTauri && paths?.length ? call('discard_partials', { paths }) : Promise.resolve()),
  defaultDownloadDir: () => (isTauri ? call('default_download_dir') : Promise.resolve('~/Downloads/Universal Downloader')),
  loadJson: (name) => {
    if (isTauri) return call('load_json', { name })
    try {
      return Promise.resolve(JSON.parse(localStorage.getItem(`ud:${name}`) || 'null'))
    } catch {
      return Promise.resolve(null)
    }
  },
  saveJson: (name, value) => {
    if (isTauri) return call('save_json', { name, value })
    try {
      localStorage.setItem(`ud:${name}`, JSON.stringify(value))
    } catch { /* storage unavailable */ }
    return Promise.resolve()
  },
  pathExists: (path) => (isTauri ? call('path_exists', { path }) : Promise.resolve(true)),

  async onProgress(cb) {
    if (!isTauri) {
      demoListeners.add(cb)
      return () => demoListeners.delete(cb)
    }
    if (!eventApi) eventApi = await import('@tauri-apps/api/event')
    return eventApi.listen('download-progress', (e) => cb(e.payload))
  },

  async pickFolder() {
    if (!isTauri) return null
    const { open } = await import('@tauri-apps/plugin-dialog')
    const dir = await open({ directory: true, multiple: false })
    return typeof dir === 'string' ? dir : null
  },
  async openFile(path) {
    if (!isTauri || !path) return
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(path)
  },
  async showInFolder(path) {
    if (!isTauri || !path) return
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
    await revealItemInDir(path)
  },
  /// Read text from the clipboard (the webview's own clipboard API is often
  /// blocked or asks for permission inside desktop apps).
  async readClipboard() {
    if (isTauri) {
      try {
        const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
        return (await readText()) || ''
      } catch { /* fall back below */ }
    }
    return navigator.clipboard.readText()
  },
  async openFolder(dir) {
    if (!isTauri || !dir) return
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(dir)
  },
  /// Open a downloaded file; if it is missing, open its folder instead.
  /// Returns false when the file itself could not be found.
  async openOrFolder(path, dir) {
    try {
      if (path && (await api.pathExists(path))) {
        await api.openFile(path)
        return true
      }
      if (dir) await api.openFolder(dir)
    } catch { /* opening is not supported here (e.g. some mobile builds) */ }
    return false
  },
  /// Highlight the file in the file manager; if it is missing, open its folder.
  async revealOrFolder(path, dir) {
    try {
      if (path && (await api.pathExists(path))) {
        await api.showInFolder(path)
        return true
      }
      if (dir) await api.openFolder(dir)
    } catch { /* not supported here */ }
    return false
  },
  async openUrl(url) {
    if (!isTauri) {
      window.open(url, '_blank', 'noopener')
      return
    }
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  },
  async notify(title, body) {
    try {
      if (!isTauri) return
      const n = await import('@tauri-apps/plugin-notification')
      let ok = await n.isPermissionGranted()
      if (!ok) ok = (await n.requestPermission()) === 'granted'
      if (ok) n.sendNotification({ title, body })
    } catch { /* notifications unavailable */ }
  },
}
