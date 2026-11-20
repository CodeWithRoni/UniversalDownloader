import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowRight, CalendarClock, Captions, Check, ChevronDown, Clipboard, Film, FolderOpen, Link2,
  ListVideo, Music2, Play, Radio, Search, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { fmtBytes, fmtDuration, langName, looksLikeUrl, siteName, youtubeId } from '../lib/format'
import { Badge, Button, Card, cx, Input, Segmented, Select, Thumb, Toggle } from '../components/ui'

const MP3_RATES = [320, 256, 192, 128]
const HEIGHTS = [2160, 1440, 1080, 720, 480, 360]

export default function Home() {
  const { t, engine, isMobile } = useApp()
  const [tab, setTab] = useState('link')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(null)
  const [results, setResults] = useState(null)
  const inputRef = useRef(null)
  const { settings } = useApp()

  const native = engine?.engine === 'native'
  const missingEngine = engine?.engine === 'yt-dlp' && !engine.ytdlp

  async function fetchInfo(url) {
    const link = (url ?? text).trim()
    if (!link) return
    setBusy(true)
    setError('')
    setInfo(null)
    setResults(null)
    try {
      const data = await api.getInfo(link, {
        cookiesBrowser: settings.cookiesBrowser || null,
        playlistEnd: settings.channelLimit || 20,
      })
      setInfo({ ...data, sourceUrl: link })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function runSearch() {
    const q = text.trim()
    if (!q) return
    setBusy(true)
    setError('')
    setInfo(null)
    setResults(null)
    try {
      const entries = await api.searchVideos(q, 18, settings.cookiesBrowser)
      setResults({ q, entries })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function submit(e) {
    e?.preventDefault()
    if (tab === 'search' && !looksLikeUrl(text)) runSearch()
    else fetchInfo()
  }

  async function paste() {
    try {
      const clip = (await api.readClipboard()).trim()
      if (!clip) return
      setText(clip)
      if (looksLikeUrl(clip)) {
        setTab('link')
        fetchInfo(clip)
      }
    } catch {
      inputRef.current?.focus()
    }
  }

  function reset() {
    setText('')
    setInfo(null)
    setResults(null)
    setError('')
    inputRef.current?.focus()
  }

  const showHero = !info && !results

  return (
    <div className="space-y-6">
      {showHero && (
        <div className="pt-2 md:pt-8 text-center md:text-left">
          <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-accent/25 bg-accent/10 text-accent text-xs font-medium mb-4">
            <Sparkles className="size-3.5" /> {t('tagline')}
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">{t('hero_title')}</h1>
          <p className="text-muted mt-2 md:text-[15px] max-w-2xl">{native ? t('hero_sub_mobile') : t('hero_sub')}</p>
        </div>
      )}

      {missingEngine && <EngineMissing />}

      <form onSubmit={submit}>
        <Card className="p-2 md:p-2.5">
          <div className="flex items-center gap-2">
            <div className="hidden sm:block shrink-0">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'link', label: t('tab_link'), icon: Link2 },
                  { value: 'search', label: t('tab_search'), icon: Search },
                ]}
              />
            </div>
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  const v = e.clipboardData.getData('text').trim()
                  if (looksLikeUrl(v)) {
                    e.preventDefault()
                    setText(v)
                    setTab('link')
                    fetchInfo(v)
                  }
                }}
                placeholder={tab === 'link' ? t('ph_link') : t('ph_search')}
                className="w-full h-12 bg-transparent px-3 pr-9 text-[15px] outline-none placeholder:text-muted/70"
                autoFocus={!isMobile}
                spellCheck={false}
              />
              {text && (
                <button type="button" onClick={reset} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg" aria-label={t('clear')}>
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="hidden sm:block">
              <Button type="button" variant="ghost" icon={Clipboard} onClick={paste}>
                {t('paste')}
              </Button>
            </div>
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!text.trim() || missingEngine}>
              {!busy && (tab === 'search' && !looksLikeUrl(text) ? <Search className="size-4" /> : <ArrowRight className="size-4" />)}
              <span className="hidden sm:inline">{tab === 'search' && !looksLikeUrl(text) ? t('search') : t('fetch')}</span>
            </Button>
          </div>
          <div className="sm:hidden flex items-center justify-between pt-2 px-1">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'link', label: t('tab_link'), icon: Link2 },
                { value: 'search', label: t('tab_search'), icon: Search },
              ]}
            />
            <Button type="button" variant="ghost" size="sm" icon={Clipboard} onClick={paste}>
              {t('paste')}
            </Button>
          </div>
        </Card>
      </form>

      {busy && <LoadingCard label={tab === 'search' && !looksLikeUrl(text) ? t('searching') : t('fetching')} />}

      {error && (
        <Card className="p-4 border-danger/30 bg-danger/5 flex gap-3 items-start">
          <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-fg break-words min-w-0">{error}</p>
        </Card>
      )}

      {info?.kind === 'video' && <VideoPanel info={info} onDone={reset} />}
      {info?.kind === 'playlist' && <PlaylistPanel info={info} onDone={reset} />}
      {results && (
        <SearchResults
          results={results}
          onPick={(url) => {
            setText(url)
            setTab('link')
            fetchInfo(url)
          }}
        />
      )}

      {showHero && !busy && !error && <Features />}
    </div>
  )
}

function EngineMissing() {
  const { t, refreshEngine, toast } = useApp()
  const [busy, setBusy] = useState(false)
  return (
    <Card className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-warn/30 bg-warn/5">
      <AlertTriangle className="size-6 text-warn shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">{t('ytdlp_missing_title')}</div>
        <div className="text-sm text-muted">{t('ytdlp_missing_sub')}</div>
      </div>
      <Button
        variant="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const v = await api.installYtdlp()
            toast(t('ytdlp_updated', { v }), 'success')
            refreshEngine()
          } catch (e) {
            toast(e.message, 'error')
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('install_ytdlp')}
      </Button>
    </Card>
  )
}

function LoadingCard({ label }) {
  return (
    <Card className="p-4 md:p-5 flex gap-5 items-center overflow-hidden">
      <div className="w-40 md:w-64 aspect-video rounded-xl bg-surface-3 animate-pulse" />
      <div className="flex-1 space-y-3">
        <div className="h-4 w-3/4 rounded bg-surface-3 animate-pulse" />
        <div className="h-3 w-1/3 rounded bg-surface-3 animate-pulse" />
        <div className="text-xs text-muted pt-2">{label}</div>
      </div>
    </Card>
  )
}

function Features() {
  const { t, engine } = useApp()
  const native = engine?.engine === 'native'
  const items = [
    { icon: Film, title: '4K · 1080p · 720p', sub: t('video') + ' MP4' },
    { icon: Music2, title: native ? 'M4A / WebM' : 'MP3 320 kbps', sub: t('audio') },
    { icon: ListVideo, title: t('playlist') + ' · ' + t('channel'), sub: t('select_all') },
    { icon: Captions, title: t('subtitles'), sub: '.srt / embed' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
      {items.map((it) => (
        <Card key={it.title} className="p-4">
          <div className="size-9 rounded-lg bg-gradient-to-br from-accent/20 to-accent-2/20 grid place-items-center mb-3">
            <it.icon className="size-[18px] text-accent" />
          </div>
          <div className="text-sm font-semibold">{it.title}</div>
          <div className="text-xs text-muted mt-0.5">{it.sub}</div>
        </Card>
      ))}
    </div>
  )
}

function FolderChip({ mode }) {
  const { t, settings, saveSettings, isTauri, isMobile } = useApp()
  const dir = mode === 'audio' ? settings.audioDir : settings.videoDir
  return (
    <div className="flex items-center gap-2 text-xs text-muted min-w-0">
      <FolderOpen className="size-4 shrink-0" />
      <span className="shrink-0">{t('save_to')}</span>
      <span className="truncate text-fg/80" title={dir}>{dir}</span>
      {isTauri && !isMobile && (
        <button
          className="shrink-0 text-accent hover:underline"
          onClick={async () => {
            const d = await api.pickFolder()
            if (d) saveSettings(mode === 'audio' ? { audioDir: d } : { videoDir: d })
          }}
        >
          {t('change')}
        </button>
      )}
    </div>
  )
}

function QualityTile({ active, onClick, title, sub, tag }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'relative text-left rounded-xl border px-3.5 py-3 transition-all',
        active ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-line bg-surface-2/60 hover:border-accent/40 hover:bg-surface-2',
      )}
    >
      {active && (
        <span className="absolute top-2 right-2 size-4 rounded-full bg-accent grid place-items-center">
          <Check className="size-3 text-white" strokeWidth={3} />
        </span>
      )}
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted mt-0.5">
        {sub}
        {tag && <span className="ml-1.5 text-accent">{tag}</span>}
      </div>
    </button>
  )
}

function VideoPanel({ info, onDone }) {
  const { t, settings, enqueue, toast, setPage, history, engine } = useApp()
  const native = engine?.engine === 'native'
  const [mode, setMode] = useState(info.videoOptions.length === 0 ? 'audio' : settings.defaultMode)
  const pickDefaultHeight = () => {
    const opts = info.videoOptions
    if (!opts.length) return null
    const fit = opts.find((o) => o.height <= settings.defaultHeight) || opts[opts.length - 1]
    return fit.height
  }
  const [height, setHeight] = useState(pickDefaultHeight)
  const [audioKey, setAudioKey] = useState(() =>
    native ? info.audioOptions[0]?.formatId || '' : String(MP3_RATES.includes(settings.defaultAudioKbps) ? settings.defaultAudioKbps : 320),
  )
  const [subLang, setSubLang] = useState('')
  const [subEmbed, setSubEmbed] = useState(false)
  const [showAdv, setShowAdv] = useState(false)
  const [trimStart, setTrimStart] = useState('')
  const [trimEnd, setTrimEnd] = useState('')
  const [sponsor, setSponsor] = useState('')
  const [split, setSplit] = useState(false)
  const [fromStart, setFromStart] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [preview, setPreview] = useState(false)

  const ytId = youtubeId(info.url) || (info.site?.toLowerCase().includes('youtube') ? info.id : null)
  const duplicate = useMemo(
    () => history.some((h) => h.url === info.url || h.url === info.sourceUrl || (ytId && youtubeId(h.url) === ytId)),
    [history, info, ytId],
  )
  const bestAudioSize = info.audioOptions[0]?.size || 0

  function download() {
    let qualityLabel = ''
    const item = {
      url: info.url || info.sourceUrl,
      title: info.title,
      thumbnail: info.thumbnail,
      mode,
      site: info.site || siteName(info.url),
    }
    if (mode === 'video') {
      const opt = info.videoOptions.find((o) => o.height === height) || info.videoOptions[0]
      item.height = opt?.height ?? null
      item.formatId = opt?.formatId || null
      qualityLabel = opt ? (opt.height === -1 ? t('best_available') : `${opt.height}p`) : ''
      if (subLang) {
        const s = info.subtitleOptions.find((x) => x.lang === subLang)
        item.subtitle = { lang: subLang, auto: !!s?.auto, embed: subEmbed }
      }
      if (trimStart || trimEnd) item.trim = { start: trimStart || null, end: trimEnd || null }
      if (sponsor) item.sponsorBlock = sponsor
      item.splitChapters = split
      item.liveFromStart = fromStart
    } else if (native) {
      const a = info.audioOptions.find((o) => o.formatId === audioKey) || info.audioOptions[0]
      item.formatId = a?.formatId || null
      qualityLabel = a ? `${a.ext.toUpperCase()} ${a.bitrate}k` : ''
    } else {
      item.audioKbps = audioKey === 'best' ? null : Number(audioKey)
      qualityLabel = `MP3 ${audioKey === 'best' ? t('best') : audioKey + 'k'}`
    }
    item.qualityLabel = qualityLabel
    const scheduledAt = scheduleAt ? new Date(scheduleAt).getTime() : null
    enqueue([item], { scheduledAt })
    toast(t('add_to_queue'), 'success')
    setPage('queue')
    onDone?.()
  }

  return (
    <Card className="overflow-hidden animate-rise">
      <div className="grid md:grid-cols-[minmax(0,340px)_1fr] gap-0">
        <div className="p-4 md:p-5 md:border-r border-line">
          <Thumb src={info.thumbnail} className="aspect-video rounded-xl">
            {preview && ytId ? (
              <iframe
                className="absolute inset-0 size-full"
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="preview"
              />
            ) : (
              <>
                {ytId && (
                  <button
                    onClick={() => setPreview(true)}
                    className="absolute inset-0 grid place-items-center bg-black/0 hover:bg-black/30 transition group"
                    aria-label={t('preview')}
                  >
                    <span className="size-12 rounded-full bg-black/60 backdrop-blur grid place-items-center opacity-80 group-hover:opacity-100 group-hover:scale-110 transition">
                      <Play className="size-5 text-white fill-white ml-0.5" />
                    </span>
                  </button>
                )}
                {info.duration ? (
                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-semibold">
                    {fmtDuration(info.duration)}
                  </span>
                ) : null}
              </>
            )}
          </Thumb>
          <h2 className="font-semibold text-[15px] leading-snug mt-4 line-clamp-3">{info.title}</h2>
          <div className="text-sm text-muted mt-1 truncate">{info.uploader}</div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {info.site && <Badge>{info.site}</Badge>}
            {info.isLive && (
              <Badge tone="live">
                <Radio className="size-3" /> {t('live')}
              </Badge>
            )}
            {info.chapters > 0 && <Badge tone="accent">{t('chapters_n', { n: info.chapters })}</Badge>}
          </div>
          {duplicate && (
            <div className="mt-3 flex items-center gap-2 text-xs text-warn">
              <AlertTriangle className="size-3.5" /> {t('already_downloaded')}
            </div>
          )}
        </div>

        <div className="p-4 md:p-5 space-y-5 min-w-0">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              ...(info.videoOptions.length ? [{ value: 'video', label: t('video'), icon: Film }] : []),
              ...(info.audioOptions.length || !native ? [{ value: 'audio', label: t('audio'), icon: Music2 }] : []),
            ]}
          />

          {mode === 'video' ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">{t('quality')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {info.videoOptions.map((o) => (
                  <QualityTile
                    key={o.height}
                    active={height === o.height}
                    onClick={() => setHeight(o.height)}
                    title={o.height === -1 ? t('best_available') : o.label}
                    sub={o.size ? `${o.approx ? '~' : ''}${fmtBytes(o.size)}` : 'MP4'}
                  />
                ))}
              </div>
              {native && <p className="text-xs text-muted mt-3">{t('mobile_limit')}</p>}
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">
                {native ? t('format') : t('mp3_quality')}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {native
                  ? info.audioOptions.map((a) => (
                      <QualityTile
                        key={a.formatId}
                        active={audioKey === a.formatId}
                        onClick={() => setAudioKey(a.formatId)}
                        title={`${a.bitrate} kbps`}
                        sub={`${a.ext.toUpperCase()} · ${fmtBytes(a.size)}`}
                      />
                    ))
                  : MP3_RATES.map((r) => (
                      <QualityTile
                        key={r}
                        active={audioKey === String(r)}
                        onClick={() => setAudioKey(String(r))}
                        title={`${r} kbps`}
                        sub={info.duration ? `~${fmtBytes((r * 1000 * info.duration) / 8)}` : 'MP3'}
                        tag={r === 320 ? t('best') : ''}
                      />
                    ))}
              </div>
              {!native && bestAudioSize > 0 && (
                <p className="text-xs text-muted mt-2">
                  {t('original_audio')}: {fmtBytes(bestAudioSize)}
                </p>
              )}
            </div>
          )}

          {mode === 'video' && !native && info.subtitleOptions.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2">
              <Select
                value={subLang}
                onChange={setSubLang}
                options={[
                  { value: '', label: `${t('subtitles')}: ${t('none')}` },
                  ...info.subtitleOptions.map((s) => ({
                    value: s.lang,
                    label: `${s.name || langName(s.lang, settings.language)}${s.auto ? ` (${t('auto_caption')})` : ''}`,
                  })),
                ]}
              />
              {subLang && (
                <Select
                  value={subEmbed ? 'embed' : 'file'}
                  onChange={(v) => setSubEmbed(v === 'embed')}
                  options={[
                    { value: 'file', label: t('sub_separate') },
                    { value: 'embed', label: t('sub_embed') },
                  ]}
                />
              )}
            </div>
          )}

          {!native && (
            <div className="rounded-xl border border-line">
              <button
                onClick={() => setShowAdv((v) => !v)}
                className="w-full flex items-center gap-2 px-4 h-11 text-sm font-medium text-muted hover:text-fg"
              >
                <SlidersHorizontal className="size-4" /> {t('advanced')}
                <ChevronDown className={cx('size-4 ml-auto transition', showAdv && 'rotate-180')} />
              </button>
              {showAdv && (
                <div className="px-4 pb-4 space-y-4 border-t border-line pt-4">
                  {mode === 'video' && (
                    <>
                      <div>
                        <div className="text-xs text-muted mb-1.5">{t('trim')}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={trimStart} onChange={(e) => setTrimStart(e.target.value)} placeholder={t('trim_start')} />
                          <Input value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)} placeholder={t('trim_end')} />
                        </div>
                      </div>
                      {(info.site || '').toLowerCase().includes('youtube') && (
                        <div>
                          <div className="text-xs text-muted mb-1.5">{t('sponsorblock')}</div>
                          <Select
                            className="w-full"
                            value={sponsor}
                            onChange={setSponsor}
                            options={[
                              { value: '', label: t('sb_off') },
                              { value: 'remove', label: t('sb_remove') },
                              { value: 'mark', label: t('sb_mark') },
                            ]}
                          />
                        </div>
                      )}
                      {info.chapters > 0 && <Toggle checked={split} onChange={setSplit} label={t('split_chapters')} />}
                      {info.isLive && <Toggle checked={fromStart} onChange={setFromStart} label={t('live_from_start')} />}
                    </>
                  )}
                  <div>
                    <div className="text-xs text-muted mb-1.5 flex items-center gap-1.5">
                      <CalendarClock className="size-3.5" /> {t('schedule')}
                    </div>
                    <Input type="datetime-local" className="w-full" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 pt-1">
            <div className="flex-1 min-w-0">
              <FolderChip mode={mode} />
            </div>
            <Button variant="primary" size="lg" onClick={download} className="w-full sm:w-auto">
              <ArrowRight className="size-4 rotate-90" /> {t('download')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PlaylistPanel({ info, onDone }) {
  const { t, settings, enqueue, toast, setPage, engine } = useApp()
  const native = engine?.engine === 'native'
  const [mode, setMode] = useState(settings.defaultMode)
  const [height, setHeight] = useState(String(native ? 360 : settings.defaultHeight))
  const [kbps, setKbps] = useState(String(settings.defaultAudioKbps || 320))
  const [selected, setSelected] = useState(() => new Set(info.entries.map((e) => e.id)))

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const all = selected.size === info.entries.length

  function download() {
    const chosen = info.entries.filter((e) => selected.has(e.id))
    if (!chosen.length) return
    const items = chosen.map((e) => {
      const idx = info.entries.indexOf(e) + 1
      const base = { url: e.url, title: e.title, thumbnail: e.thumbnail, mode, playlistIndex: idx, site: siteName(e.url) }
      if (mode === 'video') return { ...base, height: Number(height), qualityLabel: `${height}p` }
      return native
        ? { ...base, qualityLabel: t('best') }
        : { ...base, audioKbps: Number(kbps), qualityLabel: `MP3 ${kbps}k` }
    })
    enqueue(items)
    toast(t('t_added_n', { n: items.length }), 'success')
    setPage('queue')
    onDone?.()
  }

  return (
    <Card className="overflow-hidden animate-rise">
      <div className="p-4 md:p-5 flex gap-4 items-center border-b border-line">
        <Thumb src={info.thumbnail} className="w-28 md:w-44 aspect-video rounded-xl" />
        <div className="min-w-0 flex-1">
          <Badge tone="accent">
            <ListVideo className="size-3" /> {info.isChannel ? t('channel') : t('playlist')}
          </Badge>
          <h2 className="font-semibold text-base md:text-lg mt-2 line-clamp-2">{info.title}</h2>
          <div className="text-sm text-muted">{t('videos_n', { n: info.entries.length })}</div>
        </div>
      </div>

      <div className="p-4 md:px-5 flex flex-wrap items-center gap-3 border-b border-line bg-surface-2/40">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'video', label: t('video'), icon: Film },
            { value: 'audio', label: t('audio'), icon: Music2 },
          ]}
        />
        {mode === 'video' ? (
          <Select
            value={height}
            onChange={setHeight}
            options={(native ? [720, 360] : HEIGHTS).map((h) => ({ value: String(h), label: `${t('quality')}: ${h}p` }))}
          />
        ) : (
          !native && (
            <Select value={kbps} onChange={setKbps} options={MP3_RATES.map((r) => ({ value: String(r), label: `MP3 ${r} kbps` }))} />
          )
        )}
        <button
          className="ml-auto text-sm text-accent hover:underline"
          onClick={() => setSelected(all ? new Set() : new Set(info.entries.map((e) => e.id)))}
        >
          {all ? t('select_none') : t('select_all')}
        </button>
      </div>

      <div className="max-h-[52vh] overflow-y-auto divide-y divide-line">
        {info.entries.map((e, i) => {
          const on = selected.has(e.id)
          return (
            <label key={e.id} className={cx('flex items-center gap-3 px-4 md:px-5 py-2.5 cursor-pointer transition', on ? 'bg-accent/5' : 'hover:bg-surface-2/60')}>
              <span
                className={cx(
                  'size-5 rounded-md border grid place-items-center shrink-0 transition',
                  on ? 'bg-accent border-accent' : 'border-line bg-surface-2',
                )}
              >
                {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </span>
              <input type="checkbox" className="hidden" checked={on} onChange={() => toggle(e.id)} />
              <span className="w-6 text-xs text-muted tabular-nums text-right shrink-0">{i + 1}</span>
              <Thumb src={e.thumbnail} className="w-24 aspect-video rounded-lg hidden sm:block" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{e.title}</span>
                {e.channel && <span className="block text-xs text-muted truncate">{e.channel}</span>}
              </span>
              <span className="text-xs text-muted tabular-nums shrink-0">{fmtDuration(e.duration)}</span>
            </label>
          )
        })}
      </div>

      <div className="p-4 md:p-5 flex flex-col-reverse sm:flex-row sm:items-center gap-3 border-t border-line">
        <div className="flex-1 min-w-0">
          <FolderChip mode={mode} />
        </div>
        <span className="text-sm text-muted">{t('selected_n', { n: selected.size })}</span>
        <Button variant="primary" size="lg" disabled={!selected.size} onClick={download}>
          <ArrowRight className="size-4 rotate-90" /> {t('download_selected', { n: selected.size })}
        </Button>
      </div>
    </Card>
  )
}

function SearchResults({ results, onPick }) {
  const { t } = useApp()
  if (!results.entries.length) return <Card className="p-8 text-center text-muted text-sm">{t('no_results')}</Card>
  return (
    <div className="animate-rise">
      <h3 className="text-sm font-semibold text-muted mb-3">{t('search_results', { q: results.q })}</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.entries.map((e) => (
          <button key={e.id} onClick={() => onPick(e.url)} className="text-left group">
            <Thumb src={e.thumbnail} className="aspect-video rounded-xl ring-1 ring-line group-hover:ring-accent transition">
              {e.duration ? (
                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-semibold">
                  {fmtDuration(e.duration)}
                </span>
              ) : null}
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition grid place-items-center">
                <span className="opacity-0 group-hover:opacity-100 transition h-9 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-1.5">
                  {t('choose')} <ArrowRight className="size-4" />
                </span>
              </span>
            </Thumb>
            <div className="mt-2.5 text-sm font-medium line-clamp-2 group-hover:text-accent transition">{e.title}</div>
            <div className="text-xs text-muted mt-0.5 truncate">{e.channel}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

