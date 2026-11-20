import { useState } from 'react'
import { CheckCircle2, FolderOpen, Github, Moon, Monitor, RefreshCw, Sun, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useApp, validRate } from '../lib/store'
import { Button, Field, Input, Section, Segmented, Select, Toggle, cx } from '../components/ui'

function FolderField({ label, value, onPick }) {
  const { isTauri, isMobile } = useApp()
  return (
    <Field label={label}>
      <button
        disabled={!isTauri || isMobile}
        onClick={onPick}
        className="w-full h-10 flex items-center gap-2 px-3 rounded-xl bg-surface-2 border border-line text-sm text-left hover:border-accent/40 disabled:hover:border-line transition"
        title={value}
      >
        <FolderOpen className="size-4 text-muted shrink-0" />
        <span className="truncate">{value}</span>
      </button>
    </Field>
  )
}

function Status({ ok, children }) {
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-sm', ok ? 'text-success' : 'text-danger')}>
      <Icon className="size-4" /> {children}
    </span>
  )
}

export default function Settings() {
  const { t, settings: s, saveSettings: save, engine, refreshEngine, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const native = engine?.engine === 'native'

  const pick = async (key) => {
    const d = await api.pickFolder()
    if (d) save({ [key]: d })
  }

  async function updateEngine() {
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
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('settings_title')}</h1>

      <Section title={t('s_general')}>
        <Field label={t('language')}>
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={s.language}
            onChange={(v) => save({ language: v })}
            options={[
              { value: 'en', label: 'English' },
              { value: 'bn', label: 'বাংলা' },
            ]}
          />
        </Field>
        <Field label={t('theme')}>
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={s.theme}
            onChange={(v) => save({ theme: v })}
            options={[
              { value: 'dark', label: t('theme_dark'), icon: Moon },
              { value: 'light', label: t('theme_light'), icon: Sun },
              { value: 'system', label: t('theme_system'), icon: Monitor },
            ]}
          />
        </Field>
        <Toggle checked={s.notify} onChange={(v) => save({ notify: v })} label={t('notify')} />
      </Section>

      <Section title={t('s_downloads')}>
        <FolderField label={t('video_folder')} value={s.videoDir} onPick={() => pick('videoDir')} />
        <FolderField label={t('audio_folder')} value={s.audioDir} onPick={() => pick('audioDir')} />
        <Field label={t('default_mode')}>
          <Select
            className="w-full"
            value={s.defaultMode}
            onChange={(v) => save({ defaultMode: v })}
            options={[
              { value: 'video', label: t('video') },
              { value: 'audio', label: t('audio') },
            ]}
          />
        </Field>
        <Field label={t('default_quality')}>
          <Select
            className="w-full"
            value={String(s.defaultHeight)}
            onChange={(v) => save({ defaultHeight: Number(v) })}
            options={[2160, 1440, 1080, 720, 480, 360].map((h) => ({ value: String(h), label: `${h}p` }))}
          />
        </Field>
        {!native && (
          <Field label={t('default_audio')}>
            <Select
              className="w-full"
              value={String(s.defaultAudioKbps)}
              onChange={(v) => save({ defaultAudioKbps: Number(v) })}
              options={[320, 256, 192, 128].map((r) => ({ value: String(r), label: `MP3 ${r} kbps` }))}
            />
          </Field>
        )}
        <Field label={t('parallel')}>
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-0"
            value={s.parallel}
            onChange={(v) => save({ parallel: v })}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>
        <Field label={t('name_template')}>
          <Select
            className="w-full"
            value={s.nameTemplate}
            onChange={(v) => save({ nameTemplate: v })}
            options={[
              { value: 'title', label: t('nt_title') },
              { value: 'title-quality', label: t('nt_title_quality') },
              { value: 'index-title', label: t('nt_index_title') },
            ]}
          />
        </Field>
        {!native && <Toggle checked={s.embedTags} onChange={(v) => save({ embedTags: v })} label={t('embed_tags')} />}
        {!native && <Toggle checked={s.useArchive} onChange={(v) => save({ useArchive: v })} label={t('skip_downloaded')} />}
      </Section>

      {!native && (
        <Section title={t('s_advanced')}>
          <Field label={t('speed_limit')} hint={t('speed_limit_hint')}>
            <Input
              className={`w-full ${s.limitRate && !validRate(s.limitRate) ? 'ring-2 ring-danger/60' : ''}`}
              value={s.limitRate}
              placeholder="2M"
              onChange={(e) => save({ limitRate: e.target.value })}
            />
          </Field>
          <Field label={t('fragments')}>
            <Select
              className="w-full"
              value={String(s.concurrentFragments)}
              onChange={(v) => save({ concurrentFragments: Number(v) })}
              options={[1, 2, 4, 8, 16].map((n) => ({ value: String(n), label: n === 1 ? t('sb_off') : `${n}×` }))}
            />
          </Field>
          <Field label={t('cookies')} hint={t('cookies_hint')}>
            <Select
              className="w-full"
              value={s.cookiesBrowser}
              onChange={(v) => save({ cookiesBrowser: v })}
              options={[
                { value: '', label: t('none') },
                ...['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'safari', 'chromium'].map((b) => ({
                  value: b,
                  label: b[0].toUpperCase() + b.slice(1),
                })),
              ]}
            />
          </Field>
          <Field label={t('channel_limit')}>
            <Select
              className="w-full"
              value={String(s.channelLimit)}
              onChange={(v) => save({ channelLimit: Number(v) })}
              options={[10, 20, 50, 100, 200].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </Field>
        </Section>
      )}

      <Section title={t('s_engine')}>
        <p className="text-sm text-muted">{native ? t('engine_desc_mobile') : t('engine_desc_desktop')}</p>
        {engine && !native && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="text-xs text-muted mb-1">yt-dlp</div>
              <Status ok={engine.ytdlp}>{engine.ytdlp ? engine.version || t('installed') : t('missing')}</Status>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="text-xs text-muted mb-1">ffmpeg</div>
              <Status ok={engine.ffmpeg}>{engine.ffmpeg ? t('installed') : t('missing')}</Status>
            </div>
          </div>
        )}
        {engine && !native && (
          <Button icon={RefreshCw} loading={busy} onClick={updateEngine}>
            {busy ? t('updating') : engine.ytdlp ? t('update_ytdlp') : t('install_ytdlp')}
          </Button>
        )}
        {native && engine && <div className="text-sm">{engine.version}</div>}
      </Section>

      <Section title={t('s_about')}>
        <div className="flex items-center gap-4">
          <img src="./app-icon.svg" alt="" className="size-12 rounded-xl" />
          <div className="flex-1">
            <div className="font-semibold">{t('appName')}</div>
            <div className="text-sm text-muted">
              {t('version')} {engine?.appVersion || '2.0.0'} · Rust + Tauri
            </div>
          </div>
          <Button size="sm" icon={Github} onClick={() => api.openUrl('https://github.com/CodeWithRoni/UniversalDownloader').catch(() => {})}>
            {t('github')}
          </Button>
        </div>
      </Section>
    </div>
  )
}
