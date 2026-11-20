export function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return ''
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export function timeAgo(ts, lang) {
  const diff = (Date.now() - ts) / 1000
  try {
    const rtf = new Intl.RelativeTimeFormat(lang === 'bn' ? 'bn' : 'en', { numeric: 'auto' })
    if (diff < 60) return rtf.format(-Math.round(diff), 'second')
    if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
    return rtf.format(-Math.round(diff / 86400), 'day')
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export function langName(code, uiLang) {
  try {
    return new Intl.DisplayNames([uiLang === 'bn' ? 'bn' : 'en'], { type: 'language' }).of(code) || code
  } catch {
    return code
  }
}

/// YouTube video id from a link (for previews / duplicate checks).
export function youtubeId(url) {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)
  return m ? m[1] : null
}

export function looksLikeUrl(text) {
  return /^(https?:\/\/|www\.)\S+$/i.test(String(text || '').trim())
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, '')
  } catch {
    return ''
  }
}
