import { useMemo, useState } from 'react'
import { FolderOpen, HardDrive, Library, Music2, Play, RotateCw, Search, Trash2, Film } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { fmtBytes, timeAgo } from '../lib/format'
import { Button, Card, Empty, IconButton, Input, Thumb } from '../components/ui'

export default function History() {
  const { t, history, removeHistory, clearHistory, enqueue, toast, setPage, settings, isMobile } = useApp()
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? history.filter((h) => h.title?.toLowerCase().includes(s) || h.site?.toLowerCase().includes(s)) : history
  }, [history, q])
  const totalSize = history.reduce((a, h) => a + (h.sizeBytes || 0), 0)
  const videos = history.filter((h) => h.mode !== 'audio').length

  async function open(h) {
    if (!(await api.openOrFolder(h.filePath, h.params?.outDir))) toast(t('file_missing_folder'), 'error')
  }

  async function reveal(h) {
    if (!(await api.revealOrFolder(h.filePath, h.params?.outDir))) toast(t('file_missing_folder'), 'error')
  }

  function again(h) {
    const p = h.params || {}
    enqueue([
      {
        url: h.url,
        title: h.title,
        thumbnail: h.thumbnail,
        mode: h.mode,
        height: p.height,
        formatId: p.formatId,
        audioKbps: p.audioQuality,
        subtitle: p.subtitle,
        qualityLabel: h.qualityLabel,
        site: h.site,
      },
    ])
    toast(t('add_to_queue'), 'success')
    setPage('queue')
  }

  const stats = [
    { icon: Library, label: t('total_files'), value: history.length },
    { icon: Film, label: t('video'), value: videos },
    { icon: Music2, label: t('audio'), value: history.length - videos },
    { icon: HardDrive, label: t('total_size'), value: fmtBytes(totalSize) },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="flex-1 text-2xl md:text-3xl font-bold tracking-tight">{t('history_title')}</h1>
        {history.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={() => {
              if (window.confirm(t('confirm_clear'))) clearHistory()
            }}
          >
            {t('clear_history')}
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <Card>
          <Empty icon={Library} title={t('history_empty')} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <Card key={s.label} className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-xl bg-accent/10 grid place-items-center">
                  <s.icon className="size-5 text-accent" />
                </div>
                <div>
                  <div className="text-lg font-bold tabular-nums leading-tight">{s.value}</div>
                  <div className="text-xs text-muted">{s.label}</div>
                </div>
              </Card>
            ))}
          </div>

          <div className="relative">
            <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="w-full pl-9 h-11" placeholder={t('history_search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <Card className="divide-y divide-line overflow-hidden">
            {filtered.map((h) => (
              <div key={h.id} className="flex items-center gap-3 md:gap-4 p-3 md:px-4 hover:bg-surface-2/50 transition group">
                <Thumb src={h.thumbnail} className="w-20 md:w-28 aspect-video rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{h.title}</div>
                  <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-2">
                    <span>{h.qualityLabel}</span>
                    {h.sizeBytes ? <span>· {fmtBytes(h.sizeBytes)}</span> : null}
                    <span>· {timeAgo(h.finishedAt, settings.language)}</span>
                  </div>
                </div>
                <div className="flex items-center shrink-0">
                  {(h.filePath || h.params?.outDir) && <IconButton icon={Play} title={t('open')} onClick={() => open(h)} />}
                  {(h.filePath || h.params?.outDir) && !isMobile && (
                    <IconButton icon={FolderOpen} title={t('show_in_folder')} onClick={() => reveal(h)} />
                  )}
                  <IconButton icon={RotateCw} title={t('redownload')} onClick={() => again(h)} />
                  <IconButton icon={Trash2} title={t('remove')} onClick={() => removeHistory(h.id)} />
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
