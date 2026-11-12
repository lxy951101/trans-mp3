import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import type { AudioMeta } from '@shared/types'
import { buildProbeArgs } from './convert-args'

const execFileAsync = promisify(execFile)

/**
 * 用 CommonJS 解析器按需加载二进制包：
 * 打包后这些包并不在 asar 中（由 extraResources 提供二进制），
 * 因此必须惰性加载并吞掉 MODULE_NOT_FOUND，绝不能在模块顶层 require。
 */
const requireFromHere = createRequire(__filename)

function loadStaticPath(id: 'ffmpeg-static' | 'ffprobe-static'): string | null {
  try {
    const mod = requireFromHere(id) as unknown
    if (typeof mod === 'string') return mod
    if (mod && typeof mod === 'object') {
      const value = mod as { default?: unknown; path?: unknown }
      if (typeof value.default === 'string') return value.default
      if (typeof value.path === 'string') return value.path
      const inner = value.default as { path?: unknown } | undefined
      if (inner && typeof inner.path === 'string') return inner.path
    }
  } catch {
    return null
  }
  return null
}

export interface AudioBinaries {
  ffmpeg: string | null
  ffprobe: string | null
}

export interface AudioProbe {
  duration: number
  bitrate: number
  sampleRate: number
  channels: number
  title: string
  artist: string
  album: string
  hasCover: boolean
}

let cachedBinaries: AudioBinaries | null = null

/** 打包后二进制位于 app.asar.unpacked，需要把路径从 asar 内修正出来 */
function unpackedPath(filePath: string): string {
  return filePath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}

/** 打包时通过 extraResources 放到 resources/bin 下的可执行文件 */
function packagedBinary(fileName: string): string | null {
  const base = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (!base) return null
  const candidate = join(base, 'bin', fileName)
  return existsSync(candidate) ? candidate : null
}

const BIN_SUFFIX = process.platform === 'win32' ? '.exe' : ''

function findOnPath(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, `${name}${ext}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

/** 解析 ffmpeg / ffprobe 可执行文件路径 */
export function resolveBinaries(): AudioBinaries {
  if (cachedBinaries) return cachedBinaries

  let ffmpeg: string | null = null
  let ffprobe: string | null = null

  // 1) 打包后的 resources/bin（extraResources 放置）
  ffmpeg = packagedBinary(`ffmpeg${BIN_SUFFIX}`)
  ffprobe = packagedBinary(`ffprobe${BIN_SUFFIX}`)

  // 2) 开发环境：ffmpeg-static / ffprobe-static 提供的二进制
  if (!ffmpeg) {
    const candidate = loadStaticPath('ffmpeg-static')
    if (candidate && existsSync(unpackedPath(candidate))) ffmpeg = unpackedPath(candidate)
  }

  if (!ffprobe) {
    const candidate = loadStaticPath('ffprobe-static')
    if (candidate && existsSync(unpackedPath(candidate))) ffprobe = unpackedPath(candidate)
  }

  // 3) 最后回退到 PATH
  ffmpeg ??= findOnPath('ffmpeg')
  ffprobe ??= findOnPath('ffprobe')

  cachedBinaries = { ffmpeg, ffprobe }
  return cachedBinaries
}

/** 读取 ffmpeg 版本号（用于关于信息与自检） */
export async function getFfmpegVersion(binaries: AudioBinaries): Promise<string> {
  if (!binaries.ffmpeg) return ''
  try {
    const { stdout } = await execFileAsync(binaries.ffmpeg, ['-version'], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 1024 * 1024
    })
    const firstLine = stdout.split(/\r?\n/)[0] ?? ''
    return firstLine.replace(/^ffmpeg version\s*/i, '').trim()
  } catch {
    return ''
  }
}

interface RawStream {
  codec_type?: string
  codec_name?: string
  sample_rate?: string
  channels?: number
  bit_rate?: string
  disposition?: { attached_pic?: number }
}

interface RawProbe {
  format?: {
    duration?: string
    bit_rate?: string
    tags?: Record<string, string>
    format_name?: string
  }
  streams?: RawStream[]
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

/** 调用 ffprobe 读取音频元信息 */
export async function probeAudio(ffprobePath: string, filePath: string): Promise<AudioProbe> {
  const { stdout } = await execFileAsync(ffprobePath, buildProbeArgs(filePath), {
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024
  })

  let raw: RawProbe
  try {
    raw = JSON.parse(stdout) as RawProbe
  } catch {
    throw new Error('无法解析音频信息（ffprobe 输出异常）')
  }

  const streams = raw.streams ?? []
  const audioStream = streams.find((s) => s.codec_type === 'audio')
  if (!audioStream) {
    throw new Error('文件中不包含音频轨道')
  }

  const tags = raw.format?.tags ?? {}
  const hasCover = streams.some(
    (s) => s.codec_type === 'video' && (s.disposition?.attached_pic ?? 0) === 1
  )

  return {
    duration: toNumber(raw.format?.duration),
    bitrate: toNumber(audioStream.bit_rate) || toNumber(raw.format?.bit_rate),
    sampleRate: toNumber(audioStream.sample_rate),
    channels: audioStream.channels ?? 0,
    title: tags.title ?? tags.TITLE ?? '',
    artist: tags.artist ?? tags.ARTIST ?? '',
    album: tags.album ?? tags.ALBUM ?? '',
    hasCover
  }
}

/** 探测结果合并成完整的 AudioMeta（id / 文件名 / 大小由调用方补齐） */
export function mergeProbe(base: Omit<AudioMeta, keyof AudioProbe>, probe: AudioProbe): AudioMeta {
  return { ...base, ...probe }
}
