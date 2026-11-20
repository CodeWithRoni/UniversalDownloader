import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, isTauri } from './api'
import { makeT } from './i18n'
import { uid } from './format'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export const isMobile =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export const DEFAULT_SETTINGS = {
  language: 'en',
  theme: 'dark',
  videoDir: '',
  audioDir: '',
  defaultMode: 'video',
  defaultHeight: 1080,
  defaultAudioKbps: 320,
  parallel: 2,
  limitRate: '',
  nameTemplate: 'title',
  concurrentFragments: 4,
  embedTags: true,
  useArchive: false,
  notify: true,
  cookiesBrowser: '',
  channelLimit: 20,
}

const ACTIVE = new Set(['starting', 'downloading', 'processing'])
const FINISHED = new Set(['done', 'error', 'cancelled'])
const HISTORY_MAX = 1000

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [engine, setEngine] = useState(null)
  const [jobs, setJobs] = useState([])
  const [history, setHistory] = useState([])
  const [toasts, setToasts] = useState([])
  const [page, setPage] = useState('download')
  const [now, setNow] = useState(Date.now())

  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const t = useMemo(() => makeT(settings.language), [settings.language])

  // ---- toasts -------------------------------------------------------------
  const toast = useCallback((message, kind = 'info') => {
    const id = uid()
    setToasts((ts) => [...ts.slice(-3), { id, message, kind }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200)
  }, [])

  // ---- boot: settings, history, queue, engine ------------------------------
  useEffect(() => {
    ;(async () => {
      const [saved, hist, queue, dir] = await Promise.all([
        api.loadJson('settings').catch(() => null),
        api.loadJson('history').catch(() => null),
        api.loadJson('queue').catch(() => null),
        api.defaultDownloadDir().catch(() => ''),
      ])
      const s = { ...DEFAULT_SETTINGS, ...(saved || {}) }
      if (!saved?.language && navigator.language?.startsWith('bn')) s.language = 'bn'
      if (!s.videoDir) s.videoDir = dir
      if (!s.audioDir) s.audioDir = dir
      setSettings(s)
      if (Array.isArray(hist)) setHistory(hist)
      if (Array.isArray(queue)) {
        // Anything that was running when the app closed resumes as "paused".
        setJobs(queue.map((j) => (ACTIVE.has(j.status) ? { ...j, status: 'paused', speed: '', eta: '' } : j)))
      }
      setReady(true)
      api.engineStatus().then(setEngine).catch(() => {})
    })()
  }, [])

  const refreshEngine = useCallback(() => api.engineStatus().then(setEngine).catch(() => {}), [])

  const saveSettings = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      api.saveJson('settings', next).catch(() => {})
      return next
    })
  }, [])

  // ---- theme ------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', dark)
      root.lang = settings.language
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [settings.theme, settings.language])

  // ---- persistence --------------------------------------------------------
  useEffect(() => {
    if (!ready) return
    const tmr = setTimeout(() => {
      const keep = jobs.filter((j) => !FINISHED.has(j.status) || j.status === 'error')
      api.saveJson('queue', keep).catch(() => {})
    }, 600)
    return () => clearTimeout(tmr)
  }, [jobs, ready])

  useEffect(() => {
    if (!ready) return
    api.saveJson('history', history.slice(0, HISTORY_MAX)).catch(() => {})
  }, [history, ready])

  // ---- progress events ----------------------------------------------------
  const patchJob = useCallback((id, patch) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...(typeof patch === 'function' ? patch(j) : patch) } : j)))
  }, [])

  useEffect(() => {
    let unlisten = null
    let alive = true
    api
      .onProgress((ev) => {
        const job = jobsRef.current.find((j) => j.id === ev.id)
        if (!job) return
        const patch = {
          status: ev.status,
          percent: ev.percent ?? job.percent,
          speed: ev.speed || '',
          eta: ev.eta || '',
        }
        if (ev.downloaded != null) patch.downloaded = ev.downloaded
        if (ev.total != null) patch.total = ev.total
        if (ev.error) patch.error = ev.error
        if (ev.skipped) patch.skipped = true
        if (ev.filePath) patch.filePath = ev.filePath
        if (ev.sizeBytes) patch.sizeBytes = ev.sizeBytes
        if (ev.status === 'done') {
          patch.finishedAt = Date.now()
          if (!ev.skipped) {
            const item = {
              id: job.id,
              url: job.url,
              title: job.title,
              thumbnail: job.thumbnail,
              mode: job.mode,
              qualityLabel: job.qualityLabel,
              site: job.site,
              filePath: ev.filePath || '',
              sizeBytes: ev.sizeBytes || 0,
              finishedAt: Date.now(),
              params: job.params,
            }
            setHistory((h) => [item, ...h.filter((x) => x.id !== job.id)])
          }
          const tt = makeT(settingsRef.current.language)
          if (settingsRef.current.notify && !document.hasFocus()) api.notify(tt('t_done'), job.title)
        } else if (ev.status === 'error') {
          const tt = makeT(settingsRef.current.language)
          if (settingsRef.current.notify && !document.hasFocus()) api.notify(tt('t_failed'), job.title)
        }
        patchJob(ev.id, patch)
      })
      .then((fn) => {
        if (alive) unlisten = fn
        else fn()
      })
    return () => {
      alive = false
      if (unlisten) unlisten()
    }
  }, [patchJob])

  // ---- scheduler ----------------------------------------------------------
  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(tmr)
  }, [])

  const launch = useCallback(
    async (job) => {
      try {
        await api.startDownload(job.params)
      } catch (e) {
        patchJob(job.id, { status: 'error', error: e.message })
      }
    },
    [patchJob],
  )

  useEffect(() => {
    if (!ready) return
    const running = jobs.filter((j) => ACTIVE.has(j.status)).length
    const free = Math.max(0, (settings.parallel || 2) - running)
    if (free === 0) return
    const next = jobs
      .filter((j) => j.status === 'queued' && (!j.scheduledAt || j.scheduledAt <= now))
      .slice(0, free)
    if (next.length === 0) return
    const ids = new Set(next.map((j) => j.id))
    setJobs((js) => js.map((j) => (ids.has(j.id) ? { ...j, status: 'starting', error: undefined } : j)))
    next.forEach(launch)
  }, [jobs, ready, settings.parallel, now, launch])

  // ---- queue actions ------------------------------------------------------
  const buildParams = useCallback((item, id) => {
    const s = settingsRef.current
    return {
      id,
      url: item.url,
      mode: item.mode,
      height: item.mode === 'video' ? item.height ?? s.defaultHeight : null,
      formatId: item.formatId || null,
      audioQuality: item.mode === 'audio' ? item.audioKbps ?? null : null,
      outDir: item.mode === 'audio' ? s.audioDir : s.videoDir,
      title: item.title || null,
      subtitle: item.subtitle || null,
      embedTags: !!s.embedTags,
      trim: item.trim || null,
      sponsorBlock: item.sponsorBlock || null,
      splitChapters: !!item.splitChapters,
      liveFromStart: !!item.liveFromStart,
      concurrentFragments: s.concurrentFragments || null,
      limitRate: s.limitRate || null,
      useArchive: !!s.useArchive,
      nameTemplate: s.nameTemplate,
      playlistIndex: item.playlistIndex ?? null,
      cookiesBrowser: s.cookiesBrowser || null,
    }
  }, [])

  /// items: [{url,title,thumbnail,mode,height,formatId,audioKbps,qualityLabel,site,...}]
  const enqueue = useCallback(
    (items, opts = {}) => {
      const created = items.map((item) => {
        const id = uid()
        return {
          id,
          url: item.url,
          title: item.title || item.url,
          thumbnail: item.thumbnail || '',
          mode: item.mode,
          qualityLabel: item.qualityLabel || '',
          site: item.site || '',
          status: 'queued',
          percent: 0,
          speed: '',
          eta: '',
          addedAt: Date.now(),
          scheduledAt: opts.scheduledAt || null,
          params: buildParams(item, id),
        }
      })
      setJobs((js) => [...js, ...created])
      return created
    },
    [buildParams],
  )

  const pause = useCallback(
    (id) => {
      const j = jobsRef.current.find((x) => x.id === id)
      if (!j) return
      if (ACTIVE.has(j.status)) api.pauseDownload(id)
      else if (j.status === 'queued') patchJob(id, { status: 'paused' })
    },
    [patchJob],
  )
  const resume = useCallback((id) => patchJob(id, { status: 'queued', scheduledAt: null, error: undefined }), [patchJob])
  const cancel = useCallback(
    (id) => {
      const j = jobsRef.current.find((x) => x.id === id)
      if (!j) return
      if (ACTIVE.has(j.status)) api.cancelDownload(id)
      else patchJob(id, { status: 'cancelled' })
    },
    [patchJob],
  )
  const remove = useCallback((id) => setJobs((js) => js.filter((j) => j.id !== id)), [])
  const retry = useCallback((id) => patchJob(id, { status: 'queued', percent: 0, error: undefined }), [patchJob])
  const clearFinished = useCallback(() => setJobs((js) => js.filter((j) => !FINISHED.has(j.status))), [])
  const pauseAll = useCallback(() => {
    jobsRef.current.forEach((j) => {
      if (ACTIVE.has(j.status) || j.status === 'queued') pause(j.id)
    })
  }, [pause])
  const resumeAll = useCallback(() => {
    setJobs((js) => js.map((j) => (j.status === 'paused' ? { ...j, status: 'queued', scheduledAt: null } : j)))
  }, [])
  const move = useCallback((id, dir) => {
    setJobs((js) => {
      const i = js.findIndex((j) => j.id === id)
      const k = i + dir
      if (i < 0 || k < 0 || k >= js.length) return js
      const copy = [...js]
      ;[copy[i], copy[k]] = [copy[k], copy[i]]
      return copy
    })
  }, [])

  const removeHistory = useCallback((id) => setHistory((h) => h.filter((x) => x.id !== id)), [])
  const clearHistory = useCallback(() => setHistory([]), [])

  const value = {
    t,
    ready,
    settings,
    saveSettings,
    engine,
    refreshEngine,
    jobs,
    history,
    enqueue,
    pause,
    resume,
    cancel,
    remove,
    retry,
    move,
    clearFinished,
    pauseAll,
    resumeAll,
    removeHistory,
    clearHistory,
    toasts,
    toast,
    page,
    setPage,
    isTauri,
    isMobile,
    activeCount: jobs.filter((j) => ACTIVE.has(j.status) || j.status === 'queued').length,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { ACTIVE, FINISHED }
