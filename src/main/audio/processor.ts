import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type {
  AudioMeta,
  BatchDoneEvent,
  ConvertOptions,
  ItemDoneEvent,
  ItemErrorEvent,
  ProgressEvent
} from '@shared/types'
import {
  buildFfmpegArgs,
  type FfmpegBuildParams
} from './convert-args'
import type { AudioBinaries } from './ffmpeg'
import { probeAudio } from './ffmpeg'
import {
  createWatermarkSpec,
  renderWatermarkWav,
  watermarkCacheKey
} from './watermark'

export interface ProcessorHooks {
  onProgress(event: ProgressEvent): void
  onItemStart(id: string): void
  onItemDone(event: ItemDoneEvent): void
  onItemError(event: ItemErrorEvent): void
}

interface RunningChild {
  id: string
  child: ChildProcessWithoutNullStreams
  killedByCancel: boolean
}

const MAX_STDERR = 6000

/**
 * 批量音频处理器：负责生成输出路径、渲染标记音效、驱动 ffmpeg 并汇报进度。
 */
export class BatchProcessor {
  private running = false
  private canceled = false
  private children = new Map<string, RunningChild>()

  constructor(
    private readonly binaries: AudioBinaries,
    private readonly tempDir: string
  ) {}

  get isRunning(): boolean {
    return this.running
  }

  /** 请求取消：终止所有子进程，未开始的任务直接跳过 */
  cancel(): void {
    if (!this.running) return
    this.canceled = true
    for (const entry of this.children.values()) {
      entry.killedByCancel = true
      try {
        entry.child.kill()
      } catch {
        /* 忽略：进程可能已退出 */
      }
    }
  }

  async run(
    items: AudioMeta[],
    options: ConvertOptions,
    hooks: ProcessorHooks
  ): Promise<BatchDoneEvent> {
    if (this.running) {
      throw new Error('已有任务正在处理中')
    }
    if (!this.binaries.ffmpeg || !this.binaries.ffprobe) {
      throw new Error('未找到 ffmpeg / ffprobe，无法进行音频处理')
    }

    this.running = true
    this.canceled = false
    const startedAt = Date.now()
    let succeeded = 0
    let failed = 0

    try {
      const watermarkPath = options.watermarkEnabled
        ? this.ensureWatermarkFile(options)
        : null

      const queue = [...items]
      let cursor = 0

      const workerCount = Math.max(1, Math.min(4, options.concurrency))
      const worker = async (): Promise<void> => {
        while (true) {
          if (this.canceled) return
          const index = cursor++
          if (index >= queue.length) return
          const item = queue[index]!
          if (this.canceled) return

          hooks.onItemStart(item.id)
          try {
            const result = await this.processOne(item, options, watermarkPath, hooks)
            succeeded += 1
            hooks.onItemDone(result)
          } catch (error) {
            if (this.canceled) return
            failed += 1
            hooks.onItemError({
              id: item.id,
              message: toFriendlyMessage(error)
            })
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()))
    } finally {
      this.running = false
      this.children.clear()
    }

    return {
      total: items.length,
      succeeded,
      failed,
      canceled: this.canceled,
      elapsed: Date.now() - startedAt
    }
  }

  /** 渲染并缓存 1 秒标记音效 WAV */
  private ensureWatermarkFile(options: ConvertOptions): string {
    const spec = createWatermarkSpec(
      options.watermarkPreset,
      options.watermarkVolume,
      options.sampleRate
    )
    const key = watermarkCacheKey(spec)
    const file = join(this.tempDir, `music-tool-watermark-${hash(key)}.wav`)
    if (!existsSync(file)) {
      mkdirSync(this.tempDir, { recursive: true })
      writeFileSync(file, renderWatermarkWav(spec))
    }
    return file
  }

  private async processOne(
    item: AudioMeta,
    options: ConvertOptions,
    watermarkPath: string | null,
    hooks: ProcessorHooks
  ): Promise<ItemDoneEvent> {
    const startedAt = Date.now()
    const outputPath = this.buildOutputPath(item, options)

    const totalDuration = item.duration + (watermarkPath ? 1 : 0)
    const args = buildFfmpegArgs({
      input: item.path,
      output: outputPath,
      watermarkPath,
      bitrate: options.bitrate,
      sampleRate: options.sampleRate,
      hasCover: item.hasCover,
      copyTags: options.copyTags,
      overwrite: options.overwrite
    })

    let stderr = ''
    let lastEmit = 0
    let child: ChildProcessWithoutNullStreams | null = null

    // 带封面复制的参数失败时，退化为不复制封面重试一次
    const attempts: FfmpegBuildParams[] = [
      {
        input: item.path,
        output: outputPath,
        watermarkPath,
        bitrate: options.bitrate,
        sampleRate: options.sampleRate,
        hasCover: item.hasCover,
        copyTags: options.copyTags,
        overwrite: options.overwrite
      }
    ]
    if (item.hasCover) {
      attempts.push({ ...attempts[0]!, hasCover: false })
    }

    let lastError: unknown = null
    for (let attempt = 0; attempt < attempts.length; attempt++) {
      stderr = ''
      const currentArgs =
        attempt === 0 ? args : buildFfmpegArgs(attempts[attempt]!)
      try {
        await new Promise<void>((resolve, reject) => {
          const spawned = spawn(this.binaries.ffmpeg!, currentArgs, {
            windowsHide: true
          })
          child = spawned
          this.children.set(item.id, {
            id: item.id,
            child: spawned,
            killedByCancel: false
          })

          spawned.stdout.setEncoding('utf8')
          spawned.stdout.on('data', (chunk: string) => {
            const now = Date.now()
            for (const line of chunk.split(/\r?\n/)) {
              const match = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim())
              if (!match) continue
              const microseconds = Number(match[1])
              if (!Number.isFinite(microseconds) || totalDuration <= 0) continue
              const progress = Math.max(
                0,
                Math.min(99, (microseconds / 1_000_000 / totalDuration) * 100)
              )
              if (now - lastEmit < 120) continue
              lastEmit = now
              hooks.onProgress({ id: item.id, progress, speed: 0 })
            }
          })

          spawned.stderr.setEncoding('utf8')
          spawned.stderr.on('data', (chunk: string) => {
            stderr = (stderr + chunk).slice(-MAX_STDERR)
          })

          spawned.on('error', (error) => reject(error))
          spawned.on('close', (code) => {
            this.children.delete(item.id)
            if (code === 0) {
              resolve()
            } else {
              reject(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`))
            }
          })
        })
        lastError = null
        break
      } catch (error) {
        lastError = error
        if (this.canceled) throw error
        // 仅封面流导致失败时才重试
        const message = String((error as Error)?.message ?? '')
        const coverRelated = /attached_pic|video|stream|Invalid argument/i.test(
          message
        )
        if (attempt === 0 && item.hasCover && coverRelated) {
          hooks.onProgress({ id: item.id, progress: 0, speed: 0 })
          continue
        }
        throw error
      }
    }

    if (lastError) throw lastError
    if (!child) throw new Error('无法启动 ffmpeg')

    const size = statSync(outputPath).size

    // 输出时长校验：正常应为原时长 + 音效时长
    let finalDuration = totalDuration
    try {
      const probe = await probeAudio(this.binaries.ffprobe!, outputPath)
      if (probe.duration > 0) finalDuration = probe.duration
    } catch {
      /* 校验失败不影响主流程 */
    }

    hooks.onProgress({ id: item.id, progress: 100, speed: 0 })

    return {
      id: item.id,
      outputPath,
      outputSize: size,
      duration: finalDuration,
      elapsed: Date.now() - startedAt
    }
  }

  /** 计算单个文件的输出路径，自动避开重名 */
  private buildOutputPath(item: AudioMeta, options: ConvertOptions): string {
    const suffix = options.suffix ?? ''
    let dir: string
    if (options.outputMode === 'custom' && options.outputDir) {
      dir = options.outputDir
    } else {
      dir = dirname(item.path)
    }
    mkdirSync(dir, { recursive: true })

    const stem = basename(item.path, extname(item.path))
    let candidate = join(dir, `${stem}${suffix}.mp3`)

    // 绝不允许覆盖源文件本身
    if (candidate.toLowerCase() === item.path.toLowerCase()) {
      candidate = join(dir, `${stem}_processed.mp3`)
    }

    if (options.overwrite) return candidate

    if (!existsSync(candidate)) return candidate
    let index = 2
    while (existsSync(join(dir, `${stem}${suffix} (${index}).mp3`))) {
      index += 1
      if (index > 9999) break
    }
    return join(dir, `${stem}${suffix} (${index}).mp3`)
  }
}

function toFriendlyMessage(error: unknown): string {
  const raw = String((error as Error)?.message ?? error ?? '处理失败')
  const message = raw.replace(/\s+/g, ' ').trim()
  if (/No such file or directory/i.test(message)) return '源文件不存在或已被移动'
  if (/Invalid data found when processing input/i.test(message)) {
    return '无法识别的音频数据，文件可能已损坏'
  }
  if (/Permission denied/i.test(message)) return '没有写入权限，请更换输出位置'
  if (/No space left on device/i.test(message)) return '磁盘空间不足'
  if (/already exists/i.test(message)) return '输出文件已存在且未允许覆盖'
  return message.length > 240 ? `${message.slice(0, 240)}…` : message
}

/** 简易字符串哈希，用于标记音效缓存文件名 */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}
