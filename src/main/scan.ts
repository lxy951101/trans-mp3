import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { AUDIO_EXTENSIONS, type AudioMeta, type ScanResult } from '@shared/types'
import { probeAudio, type AudioBinaries } from './audio/ffmpeg'

const AUDIO_EXT_SET = new Set<string>(AUDIO_EXTENSIONS)
const MAX_DEPTH = 8
const MAX_FILES = 3000

/** 判断扩展名是否为受支持音频 */
export function isAudioFile(filePath: string): boolean {
  const ext = extname(filePath).slice(1).toLowerCase()
  return AUDIO_EXT_SET.has(ext)
}

interface CollectResult {
  files: string[]
  skipped: number
  truncated: boolean
}

async function collectFromDirectory(
  dir: string,
  depth: number,
  acc: CollectResult,
  seen: Set<string>
): Promise<void> {
  if (depth > MAX_DEPTH || acc.files.length >= MAX_FILES) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    acc.skipped += 1
    return
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'System Volume Information') {
        continue
      }
      await collectFromDirectory(full, depth + 1, acc, seen)
    } else if (entry.isFile()) {
      if (!isAudioFile(full)) {
        continue
      }
      const key = full.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      acc.files.push(full)
      if (acc.files.length >= MAX_FILES) {
        acc.truncated = true
        return
      }
    }
  }
}

/**
 * 扫描拖入的文件 / 文件夹，返回可处理的音频列表。
 * 探测并发限制在 4，避免同时拉起过多 ffprobe 进程。
 */
export async function scanPaths(
  paths: string[],
  binaries: AudioBinaries
): Promise<ScanResult> {
  const collected: CollectResult = { files: [], skipped: 0, truncated: false }
  const seen = new Set<string>()

  for (const raw of paths) {
    const target = resolve(raw)
    let info
    try {
      info = await stat(target)
    } catch {
      collected.skipped += 1
      continue
    }

    if (info.isDirectory()) {
      await collectFromDirectory(target, 0, collected, seen)
    } else if (info.isFile()) {
      if (!isAudioFile(target)) {
        collected.skipped += 1
        continue
      }
      const key = target.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        collected.files.push(target)
      }
    } else {
      collected.skipped += 1
    }
  }

  const metas = await mapLimit(collected.files, 4, (file) =>
    buildAudioMeta(file, binaries)
  )

  return { files: metas, skipped: collected.skipped }
}

/** 为单个文件构建 AudioMeta；探测失败时 error 字段携带原因 */
export async function buildAudioMeta(
  filePath: string,
  binaries: AudioBinaries
): Promise<AudioMeta> {
  let size = 0
  try {
    const info = await stat(filePath)
    size = info.size
  } catch {
    size = 0
  }

  const ext = extname(filePath).slice(1).toLowerCase()
  const base: AudioMeta = {
    id: randomUUID(),
    path: filePath,
    name: filePath.split(/[\\/]/).pop() ?? filePath,
    ext,
    size,
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    channels: 0,
    title: '',
    artist: '',
    album: '',
    hasCover: false,
    error: ''
  }

  if (!binaries.ffprobe) {
    return { ...base, error: '缺少 ffprobe，无法读取音频信息' }
  }

  try {
    const probe = await probeAudio(binaries.ffprobe, filePath)
    return { ...base, ...probe }
  } catch (error) {
    return {
      ...base,
      error: String((error as Error)?.message ?? '无法读取音频信息').slice(0, 200)
    }
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}
