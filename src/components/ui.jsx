import { Loader2 } from 'lucide-react'

export function cx(...a) {
  return a.filter(Boolean).join(' ')
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, ...rest }) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]'
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-[15px]',
    icon: 'h-9 w-9',
    iconSm: 'h-8 w-8',
  }
  const variants = {
    primary:
      'text-white bg-gradient-to-r from-accent to-accent-2 shadow-lg shadow-accent/25 hover:shadow-accent/40 hover:brightness-110',
    secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
    ghost: 'text-muted hover:text-fg hover:bg-surface-2',
    danger: 'text-danger hover:bg-danger/10',
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4 shrink-0" /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, title, className, variant = 'ghost', ...rest }) {
  return (
    <Button variant={variant} size="iconSm" title={title} aria-label={title} className={className} {...rest}>
      <Icon className="size-4" />
    </Button>
  )
}

export function Card({ className, children, ...rest }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={cx('inline-flex p-1 rounded-xl bg-surface-2 border border-line', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex items-center gap-2 px-4 h-8 rounded-lg text-sm font-medium transition-all',
              active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {o.icon && <o.icon className={cx('size-4', active && 'text-accent')} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
      <span>
        <span className="block text-sm text-fg">{label}</span>
        {hint && <span className="block text-xs text-muted mt-0.5">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-3 border border-line',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}

export function Select({ value, onChange, options, className }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-10 rounded-xl bg-surface-2 border border-line px-3 pr-8 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/50 appearance-none bg-no-repeat bg-[right_0.6rem_center] bg-[length:16px] select-chevron',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Input({ className, ...rest }) {
  return (
    <input
      className={cx(
        'h-10 rounded-xl bg-surface-2 border border-line px-3 text-sm text-fg placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50',
        className,
      )}
      {...rest}
    />
  )
}

export function Progress({ value, status }) {
  const color =
    status === 'error'
      ? 'bg-danger'
      : status === 'done'
        ? 'bg-success'
        : status === 'paused'
          ? 'bg-warn'
          : 'bg-gradient-to-r from-accent to-accent-2'
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
      <div
        className={cx('h-full rounded-full transition-[width] duration-300', color, status === 'processing' && 'animate-pulse')}
        style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}
      />
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent/12 text-accent border-accent/25',
    success: 'bg-success/12 text-success border-success/25',
    danger: 'bg-danger/12 text-danger border-danger/25',
    warn: 'bg-warn/12 text-warn border-warn/25',
    live: 'bg-danger text-white border-danger',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-semibold tracking-wide', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Thumb({ src, className, children }) {
  return (
    <div className={cx('relative overflow-hidden bg-surface-3 shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {children}
    </div>
  )
}

export function Empty({ icon: Icon, title, sub, children }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="size-16 rounded-2xl bg-surface-2 border border-line grid place-items-center mb-5">
        <Icon className="size-7 text-muted" />
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {sub && <p className="text-sm text-muted mt-1.5 max-w-sm">{sub}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

export function Section({ title, children, className }) {
  return (
    <Card className={cx('p-5 md:p-6', className)}>
      {title && <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted mb-4">{title}</h2>}
      <div className="space-y-4">{children}</div>
    </Card>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-6">
      <div className="min-w-0">
        <div className="text-sm text-fg">{label}</div>
        {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 md:w-72">{children}</div>
    </div>
  )
}
