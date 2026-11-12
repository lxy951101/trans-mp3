/** 秒 → mm:ss 或 h:mm:ss */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 字节 → 人类可读体积 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

/** 毫秒 → 1 分 23 秒 */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 秒'
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m <= 0) return `${s} 秒`
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
}

/** 码率 bps → 320 kbps */
export function formatBitrate(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '—'
  return `${Math.round(bps / 1000)} kbps`
}

/** 采样率 → 44.1 kHz */
export function formatSampleRate(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—'
  return `${(hz / 1000).toFixed(1)} kHz`
}
