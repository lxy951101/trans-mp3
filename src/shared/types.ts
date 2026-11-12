/**
 * 主进程 / 预加载 / 渲染进程共享的类型定义
 */

/** 支持的输入音频扩展名（小写，不含点） */
export const AUDIO_EXTENSIONS = [
  'mp3',
  'flac',
  'wav',
  'aac',
  'm4a',
  'ogg',
  'opus',
  'wma',
  'aiff',
  'aif',
  'ape',
  'wv',
  'amr',
  'mp2',
  'm4b',
  'caf'
] as const

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number]

/** 单个音频文件的探测信息 */
export interface AudioMeta {
  /** 渲染进程生成的唯一 id */
  id: string
  path: string
  /** 文件名（含扩展名） */
  name: string
  /** 扩展名（小写，不含点） */
  ext: string
  /** 字节大小 */
  size: number
  /** 时长（秒） */
  duration: number
  /** 码率（bps，未知为 0） */
  bitrate: number
  /** 采样率（Hz） */
  sampleRate: number
  /** 声道数 */
  channels: number
  title: string
  artist: string
  album: string
  /** 是否带内嵌封面 */
  hasCover: boolean
  /** 无法解析时的错误信息 */
  error: string
}

export type BitratePreset = '320k' | '256k' | 'v0' | '192k'
export type SampleRatePreset = 44100 | 48000
export type OutputMode = 'beside' | 'custom'
export type WatermarkPreset = 'subtle' | 'standard' | 'enhanced'

/** 转换参数 */
export interface ConvertOptions {
  bitrate: BitratePreset
  sampleRate: SampleRatePreset
  outputMode: OutputMode
  outputDir: string
  overwrite: boolean
  copyTags: boolean
  /** 尾部标记音效开关 */
  watermarkEnabled: boolean
  watermarkPreset: WatermarkPreset
  /** 标记音效音量（dBFS，-60 ~ -24） */
  watermarkVolume: number
  /** 并发数 1-4 */
  concurrency: number
  /** 输出文件名后缀 */
  suffix: string
}

export type TrackStatus =
  | 'ready'
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'canceled'

/** 渲染进程列表中的一行 */
export interface TrackItem extends AudioMeta {
  status: TrackStatus
  /** 0-100 */
  progress: number
  message: string
  outputPath: string
  outputSize: number
}

export interface ProgressEvent {
  id: string
  progress: number
  /** 处理速度，单位：音视频秒 / 秒 */
  speed: number
}

export interface ItemDoneEvent {
  id: string
  outputPath: string
  outputSize: number
  duration: number
  elapsed: number
}

export interface ItemErrorEvent {
  id: string
  message: string
}

export interface BatchDoneEvent {
  total: number
  succeeded: number
  failed: number
  canceled: boolean
  elapsed: number
}

export interface ScanResult {
  files: AudioMeta[]
  /** 被跳过的文件数（非音频 / 无法读取 / 重复） */
  skipped: number
}

export interface AppInfo {
  version: string
  platform: string
  ffmpegReady: boolean
  ffmpegVersion: string
  ffmpegPath: string
  ffprobePath: string
}

export interface WindowState {
  isMaximized: boolean
}

/** 转换失败时的结构化错误 */
export interface ConvertFailure {
  code: string
  message: string
}
