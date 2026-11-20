import { CheckCircle2, Download, Github, Info, Library, ListOrdered, Settings as Cog, XCircle } from 'lucide-react'
import { useApp } from './lib/store'
import { cx } from './components/ui'
import Home from './pages/Home'
import Queue from './pages/Queue'
import History from './pages/History'
import Settings from './pages/Settings'

const NAV = [
  { id: 'download', icon: Download, key: 'nav_download' },
  { id: 'queue', icon: ListOrdered, key: 'nav_queue' },
  { id: 'history', icon: Library, key: 'nav_history' },
  { id: 'settings', icon: Cog, key: 'nav_settings' },
]

function Logo({ small }) {
  return (
    <img
      src="./app-icon.svg"
      alt=""
      className={cx('rounded-xl shadow-lg shadow-accent/30', small ? 'size-8' : 'size-10')}
      draggable={false}
    />
  )
}

function Sidebar() {
  const { t, page, setPage, activeCount, engine, history } = useApp()
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 h-20">
        <Logo />
        <div className="min-w-0">
          <div className="font-semibold text-[15px] leading-tight truncate">{t('appName')}</div>
          <div className="text-[11px] text-muted">v{engine?.appVersion || '2.0.0'}</div>
        </div>
      </div>
      <nav className="px-3 space-y-1 flex-1">
        {NAV.map((n) => {
          const active = page === n.id
          const count = n.id === 'queue' ? activeCount : n.id === 'history' ? history.length : 0
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={cx(
                'group w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-medium transition-all',
                active ? 'bg-accent/12 text-fg' : 'text-muted hover:text-fg hover:bg-surface-2',
              )}
            >
              <n.icon className={cx('size-[18px]', active ? 'text-accent' : 'text-muted group-hover:text-fg')} />
              <span className="flex-1 text-left">{t(n.key)}</span>
              {count > 0 && (
                <span
                  className={cx(
                    'min-w-6 h-6 px-1.5 rounded-full text-[11px] font-semibold grid place-items-center',
                    n.id === 'queue' ? 'bg-accent text-white' : 'bg-surface-3 text-muted',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="p-4">
        <EngineCard />
      </div>
    </aside>
  )
}

function EngineCard() {
  const { t, engine, setPage } = useApp()
  if (!engine) return null
  const ok = engine.engine !== 'yt-dlp' || engine.ytdlp
  return (
    <button
      onClick={() => setPage('settings')}
      className="w-full text-left rounded-xl border border-line bg-surface-2/70 p-3 hover:bg-surface-2 transition"
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        <span className={cx('size-2 rounded-full', ok ? 'bg-success shadow-[0_0_8px] shadow-success' : 'bg-danger')} />
        <span className="text-fg">{t('s_engine')}</span>
        <span className="ml-auto text-muted">{engine.engine === 'native' ? 'Rust' : engine.engine}</span>
      </div>
      <div className="text-[11px] text-muted mt-1 truncate">
        {engine.engine === 'yt-dlp' ? (engine.ytdlp ? engine.version : t('missing')) : engine.version}
      </div>
    </button>
  )
}

function MobileBar() {
  const { t, page, setPage, activeCount } = useApp()
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-surface/85 backdrop-blur-xl safe-bottom">
      <div className="grid grid-cols-4">
        {NAV.map((n) => {
          const active = page === n.id
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={cx('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', active ? 'text-accent' : 'text-muted')}
            >
              <n.icon className="size-5" />
              {t(n.key)}
              {n.id === 'queue' && activeCount > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] grid place-items-center">
                  {activeCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function MobileHeader() {
  const { t } = useApp()
  return (
    <header className="md:hidden sticky top-0 z-20 safe-top bg-bg/80 backdrop-blur-xl border-b border-line">
      <div className="flex items-center gap-3 px-4 h-14">
        <Logo small />
        <span className="font-semibold">{t('appName')}</span>
      </div>
    </header>
  )
}

function Toasts() {
  const { toasts } = useApp()
  return (
    <div className="fixed z-50 bottom-20 md:bottom-6 right-4 left-4 md:left-auto flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((x) => {
        const Icon = x.kind === 'error' ? XCircle : x.kind === 'success' ? CheckCircle2 : Info
        return (
          <div
            key={x.id}
            className="animate-rise pointer-events-auto flex items-center gap-3 max-w-sm rounded-xl border border-line bg-surface px-4 py-3 shadow-2xl text-sm"
          >
            <Icon className={cx('size-5 shrink-0', x.kind === 'error' ? 'text-danger' : x.kind === 'success' ? 'text-success' : 'text-accent')} />
            <span className="text-fg">{x.message}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const { page, ready, isTauri, t } = useApp()
  const Page = { download: Home, queue: Queue, history: History, settings: Settings }[page] || Home
  return (
    <div className="h-full flex bg-bg text-fg app-glow">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileHeader />
        {!isTauri && (
          <div className="flex items-center justify-center gap-2 text-xs py-2 bg-accent/10 text-accent border-b border-accent/20">
            <Info className="size-3.5" /> {t('demo_mode')}
            <a className="underline inline-flex items-center gap-1" href="https://github.com/CodeWithRoni/UniversalDownloader/releases" target="_blank" rel="noreferrer">
              <Github className="size-3.5" /> Releases
            </a>
          </div>
        )}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-10">
          {ready && (
            <div key={page} className="animate-rise mx-auto w-full max-w-5xl px-4 md:px-10 py-6 md:py-10">
              <Page />
            </div>
          )}
        </main>
      </div>
      <MobileBar />
      <Toasts />
    </div>
  )
}
