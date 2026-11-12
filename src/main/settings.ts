import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ConvertOptions } from '@shared/types'
import { DEFAULT_OPTIONS } from '@shared/options'

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** 读取用户设置，缺失字段用默认值补齐 */
export function loadOptions(): ConvertOptions {
  try {
    const file = settingsFile()
    if (!existsSync(file)) return { ...DEFAULT_OPTIONS }
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<ConvertOptions>
    return sanitize({ ...DEFAULT_OPTIONS, ...raw })
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

/** 持久化用户设置 */
export function saveOptions(options: ConvertOptions): ConvertOptions {
  const safe = sanitize(options)
  const file = settingsFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(safe, null, 2), 'utf8')
  return safe
}

/** 参数兜底校验，避免非法值进入 ffmpeg */
export function sanitize(options: ConvertOptions): ConvertOptions {
  const bitrates = ['320k', '256k', 'v0', '192k'] as const
  const presets = ['subtle', 'standard', 'enhanced'] as const

  return {
    ...options,
    bitrate: bitrates.includes(options.bitrate) ? options.bitrate : '320k',
    sampleRate: options.sampleRate === 48000 ? 48000 : 44100,
    outputMode: options.outputMode === 'custom' ? 'custom' : 'beside',
    outputDir: typeof options.outputDir === 'string' ? options.outputDir : '',
    overwrite: Boolean(options.overwrite),
    copyTags: Boolean(options.copyTags),
    watermarkEnabled: Boolean(options.watermarkEnabled),
    watermarkPreset: presets.includes(options.watermarkPreset)
      ? options.watermarkPreset
      : 'subtle',
    watermarkVolume: clamp(Number(options.watermarkVolume) || -44, -60, -24),
    concurrency: clamp(Math.round(Number(options.concurrency) || 2), 1, 4),
    suffix: typeof options.suffix === 'string' ? options.suffix.slice(0, 40) : ''
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
