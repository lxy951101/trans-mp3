import type { ConvertOptions, WatermarkPreset } from './types'

/** 默认处理参数（主进程与渲染进程共用） */
export const DEFAULT_OPTIONS: ConvertOptions = {
  bitrate: '320k',
  sampleRate: 44100,
  outputMode: 'beside',
  outputDir: '',
  overwrite: false,
  copyTags: true,
  watermarkEnabled: true,
  watermarkPreset: 'subtle',
  watermarkVolume: -44,
  concurrency: 2,
  suffix: '_processed'
}

export const BITRATE_OPTIONS = [
  { value: '320k', label: '320k', hint: '最高品质' },
  { value: '256k', label: '256k', hint: '高品质' },
  { value: 'v0', label: 'V0', hint: '可变码率' },
  { value: '192k', label: '192k', hint: '标准' }
] as const

export const WATERMARK_PRESETS: Array<{
  value: WatermarkPreset
  label: string
  hint: string
}> = [
  {
    value: 'subtle',
    label: '隐形式',
    hint: '14.5–16.9 kHz 高频短音，正常音量下几乎无法察觉'
  },
  {
    value: 'standard',
    label: '标准',
    hint: '略高能量，机器检测更稳定'
  },
  {
    value: 'enhanced',
    label: '增强',
    hint: '12–15.2 kHz，适合背景噪声较大的曲目'
  }
]
