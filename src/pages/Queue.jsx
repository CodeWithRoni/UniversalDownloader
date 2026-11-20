import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Clock, Download, FolderOpen, Pause, Play, RotateCw, Trash2, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { ACTIVE, useApp } from '../lib/store'
import { fmtBytes } from '../lib/format'
import { Badge, Button, Card, Empty, IconButton, Progress, Thumb, cx } from '../components/ui'

function statusText(t, j) {
  if (j.status === 'queued' && j.scheduledAt && j.scheduledAt > Date.now()) {
    return t('st_scheduled', { time: new Date(j.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) })
  }
  if (j.status === 'done' && j.skipped) return t('st_skipped')
  return t(`st_${j.status}`)
}

function JobRow({ j, index, count }) {
  const { t, pause, resume, cancel, remove, retry, move, isMobile } = useApp()
  const active = ACTIVE.has(j.status)
  const tone = { done: 'success', error: 'danger', paused: 'warn', cancelled: 'neutral' }[j.status] || 'accent'
  const StatusIcon = { done: CheckCircle2, error: AlertCircle, paused: Pause, queued: Clock }[j.status] || Download

  return (
    <Card className="p-3 md:p-4">
      <div className="flex gap-3 md:gap-4">
        <Thumb src={j.thumbnail} className="w-24 md:w-36 aspect-video rounded-lg">
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold uppercase">
            {j.mode === 'audio' ? 'Audio' : 'Video'}
          </span>
        </Thumb>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium line-clamp-2 md:line-clamp-1">{j.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                <Badge tone={tone}>
                  <StatusIcon className={cx('size-3', active && 'animate-pulse')} />
                  {statusText(t, j)}
                </Badge>
                {j.qualityLabel && <span className="text-xs text-muted">{j.qualityLabel}</span>}
                {j.site && <span className="text-xs text-muted hidden md:inline">· {j.site}</span>}
              </div>
            </div>
            <div className="flex items-center -mr-1 shrink-0">
              {!isMobile && (j.status === 'queued' || j.status === 'paused') && count > 1 && (
                <>
                  <IconButton icon={ArrowUp} title={t('move_up')} disabled={index === 0} onClick={() => move(j.id, -1)} />
                  <IconButton icon={ArrowDown} title={t('move_down')} disabled={index === count - 1} onClick={() => move(j.id, 1)} />
                </>
              )}
              {(active || j.status === 'queued') && j.status !== 'processing' && (
                <IconButton icon={Pause} title={t('pause')} onClick={() => pause(j.id)} />
              )}
              {j.status === 'paused' && <IconButton icon={Play} title={t('resume')} onClick={() => resume(j.id)} />}
              {j.status === 'error' && <IconButton icon={RotateCw} title={t('retry')} onClick={() => retry(j.id)} />}
              {j.status === 'done' && j.filePath && !isMobile && (
                <IconButton icon={FolderOpen} title={t('show_in_folder')} onClick={() => api.showInFolder(j.filePath)} />
              )}
              {active || j.status === 'queued' || j.status === 'paused' ? (
                <IconButton icon={X} title={t('cancel')} variant="danger" onClick={() => cancel(j.id)} />
              ) : (
                <IconButton icon={Trash2} title={t('remove')} onClick={() => remove(j.id)} />
              )}
            </div>
          </div>

          {j.status !== 'done' && j.status !== 'cancelled' && (
            <div className="mt-3">
              <Progress value={j.status === 'processing' ? 100 : j.percent} status={j.status} />
              <div className="flex items-center justify-between text-[11px] text-muted mt-1.5 tabular-nums">
                <span>
                  {j.percent ? `${j.percent.toFixed(1)}%` : ''}
                  {j.total ? ` · ${fmtBytes(j.downloaded)} / ${fmtBytes(j.total)}` : ''}
                </span>
                <span>{[j.speed, j.eta && `ETA ${j.eta}`].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
          )}
          {j.status === 'error' && j.error && <p className="text-xs text-danger mt-2 line-clamp-3 break-words">{j.error}</p>}
          {j.status === 'done' && (
            <div className="flex items-center gap-3 mt-2.5">
              {j.sizeBytes ? <span className="text-xs text-muted">{fmtBytes(j.sizeBytes)}</span> : null}
              {j.filePath && (
                <Button size="sm" variant="secondary" icon={Play} onClick={() => api.openFile(j.filePath)}>
                  {t('open')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Queue() {
  const { t, jobs, pauseAll, resumeAll, clearFinished, setPage } = useApp()
  const running = jobs.filter((j) => ACTIVE.has(j.status)).length
  const hasPaused = jobs.some((j) => j.status === 'paused')
  const hasFinished = jobs.some((j) => ['done', 'error', 'cancelled'].includes(j.status))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('queue_title')}</h1>
          {running > 0 && <p className="text-sm text-muted mt-1">{t('active_n', { n: running })}</p>}
        </div>
        {jobs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(running > 0 || jobs.some((j) => j.status === 'queued')) && (
              <Button size="sm" icon={Pause} onClick={pauseAll}>
                {t('pause_all')}
              </Button>
            )}
            {hasPaused && (
              <Button size="sm" icon={Play} onClick={resumeAll}>
                {t('resume_all')}
              </Button>
            )}
            {hasFinished && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={clearFinished}>
                {t('clear_finished')}
              </Button>
            )}
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <Card>
          <Empty icon={Download} title={t('queue_empty')} sub={t('queue_empty_sub')}>
            <Button variant="primary" onClick={() => setPage('download')}>
              {t('nav_download')}
            </Button>
          </Empty>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((j, i) => (
            <JobRow key={j.id} j={j} index={i} count={jobs.length} />
          ))}
        </div>
      )}
    </div>
  )
}
