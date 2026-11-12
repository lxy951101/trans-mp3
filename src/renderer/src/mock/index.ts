/**
 * 浏览器内预览用的假 API。
 * 只有在非 Electron 环境（window.api 不存在）下才会启用，用于在普通浏览器里
 * 检查界面布局与交互。打包后 `import.meta.env.DEV` 为 false，整段代码会被摇掉。
 */
import type { MusicToolApi, Unsubscribe } from '@shared/api'
import type {
  BatchDoneEvent,
  ConvertOptions,
  ItemDoneEvent,
  ItemErrorEvent,
  ProgressEvent,
  TrackItem
} from '@shared/types'
import { DEFAULT_OPTIONS } from '@shared/options'

type Listener<T> = (payload: T) => void

function createEmitter<T>() {
  const listeners = new Set<Listener<T>>()
  return {
    on(callback: Listener<T>): Unsubscribe {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    emit(payload: T): void {
      for (const callback of listeners) callback(payload)
    }
  }
}

const DEMO_TRACKS: TrackItem[] = [
  {
    id: 'demo-1',
    path: 'D:\\Music\\Neon Skyline\\01 Night Drive.mp3',
    name: '01 Night Drive.mp3',
    ext: 'mp3',
    size: 9848320,
    duration: 213,
    bitrate: 320000,
    sampleRate: 44100,
    channels: 2,
    title: 'Night Drive',
    artist: 'Aurora Lane',
    album: 'Neon Skyline',
    hasCover: true,
    status: 'ready',
    progress: 0,
    message: '',
    outputPath: '',
    outputSize: 0,
    error: ''
  },
  {
    id: 'demo-2',
    path: 'D:\\Music\\Live Sets\\02 Sleepless.flac',
    name: '02 Sleepless.flac',
    ext: 'flac',
    size: 34816424,
    duration: 268,
    bitrate: 1411000,
    sampleRate: 48000,
    channels: 2,
    title: 'Sleepless',
    artist: 'Hikari Field',
    album: 'Live Sets',
    hasCover: false,
    status: 'ready',
    progress: 0,
    message: '',
    outputPath: '',
    outputSize: 0,
    error: ''
  },
  {
    id: 'demo-3',
    path: 'D:\\Music\\Old Recordings\\03 Morning Rain.wav',
    name: '03 Morning Rain.wav',
    ext: 'wav',
    size: 52428800,
    duration: 164,
    bitrate: 1411200,
    sampleRate: 44100,
    channels: 2,
    title: 'Morning Rain',
    artist: '未知艺术家',
    album: 'Old Recordings',
    hasCover: false,
    status: 'ready',
    progress: 0,
    message: '',
    outputPath: '',
    outputSize: 0,
    error: ''
  }
]

export function installMockApi(): void {
  const progress = createEmitter<ProgressEvent>()
  const itemStart = createEmitter<{ id: string }>()
  const itemDone = createEmitter<ItemDoneEvent>()
  const itemError = createEmitter<ItemErrorEvent>()
  const batchDone = createEmitter<BatchDoneEvent & { error?: string }>()
  const maximized = createEmitter<{ isMaximized: boolean }>()

  let settings: ConvertOptions = { ...DEFAULT_OPTIONS }
  let converting = false
  const timers: number[] = []

  const api: MusicToolApi & { previewTracks?: TrackItem[] } = {
    async getAppInfo() {
      return {
        version: '1.0.0',
        platform: 'win32',
        ffmpegReady: true,
        ffmpegVersion: '6.1.1-static',
        ffmpegPath: 'node_modules/ffmpeg-static/ffmpeg.exe',
        ffprobePath: 'node_modules/ffprobe-static/ffprobe.exe'
      }
    },
    async pickAudioFiles() {
      return DEMO_TRACKS.map((item) => item.path)
    },
    async pickOutputDir() {
      return 'D:\\Music\\Processed'
    },
    async pickInputDirs() {
      return ['D:\\Music']
    },
    async scanPaths(paths) {
      const wanted = DEMO_TRACKS.filter((item) => paths.includes(item.path))
      if (wanted.length) return { files: wanted, skipped: 0 }
      return { files: DEMO_TRACKS, skipped: 2 }
    },
    async getSettings() {
      return { ...settings }
    },
    async saveSettings(next) {
      settings = { ...next }
      return { ...settings }
    },
    async startConvert(items) {
      if (converting) return { ok: false, message: '已有任务在进行中' }
      converting = true
      const startedAt = Date.now()
      let finished = 0

      items.forEach((item, index) => {
        const startTimer = window.setTimeout(() => {
          itemStart.emit({ id: item.id })
          let value = 0
          const tick = window.setInterval(() => {
            value = Math.min(100, value + 14)
            progress.emit({ id: item.id, progress: value, speed: 1.9 })
            if (value < 100) return
            window.clearInterval(tick)
            finished += 1
            itemDone.emit({
              id: item.id,
              outputPath: item.path.replace(/\.[^.]+$/, `_processed.mp3`),
              outputSize: Math.round(item.size * 1.02),
              duration: item.duration + 1,
              elapsed: 1.8
            })
            if (finished === items.length) {
              converting = false
              batchDone.emit({
                total: items.length,
                succeeded: items.length,
                failed: 0,
                canceled: false,
                elapsed: Date.now() - startedAt
              })
            }
          }, 110)
          timers.push(tick)
        }, index * 260)
        timers.push(startTimer)
      })

      return { ok: true }
    },
    async cancelConvert() {
      for (const timer of timers.splice(0)) {
        window.clearInterval(timer)
        window.clearTimeout(timer)
      }
      converting = false
      batchDone.emit({
        total: DEMO_TRACKS.length,
        succeeded: 0,
        failed: 0,
        canceled: true,
        elapsed: 1200
      })
      return true
    },
    async openPath() {
      /* 预览模式不执行 */
    },
    async revealItem() {
      /* 预览模式不执行 */
    },
    getPathForFile(file: File) {
      return file.name
    },
    async minimizeWindow() {
      /* 预览模式不执行 */
    },
    async toggleMaximizeWindow() {
      const next = !document.documentElement.classList.contains('is-maximized')
      document.documentElement.classList.toggle('is-maximized', next)
      maximized.emit({ isMaximized: next })
      return next
    },
    async closeWindow() {
      /* 预览模式不执行 */
    },
    async getWindowState() {
      return { isMaximized: false }
    },
    onProgress: progress.on,
    onItemStart: itemStart.on,
    onItemDone: itemDone.on,
    onItemError: itemError.on,
    onBatchDone: batchDone.on,
    onMaximizedChanged: maximized.on
  }

  if (new URLSearchParams(window.location.search).get('demo') === 'list') {
    api.previewTracks = DEMO_TRACKS.map((item) => ({ ...item }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).api = api
}
