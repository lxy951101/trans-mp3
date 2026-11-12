<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { MusicToolApi } from '@shared/api'
import type {
  AppInfo,
  AudioMeta,
  BatchDoneEvent,
  ConvertOptions,
  TrackItem
} from '@shared/types'
import { DEFAULT_OPTIONS } from '@shared/options'
import AppTitleBar from './components/AppTitleBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import DropZone from './components/DropZone.vue'
import TrackList from './components/TrackList.vue'
import ToastStack from './components/ToastStack.vue'
import Icon from './components/Icon.vue'
import { toast } from './composables/useToast'
import { formatClock, formatDuration } from './utils/format'

const tracks = ref<TrackItem[]>([])
const options = ref<ConvertOptions>({ ...DEFAULT_OPTIONS })
const appInfo = ref<AppInfo | null>(null)
const running = ref(false)
const scanning = ref(false)
const dragging = ref(false)
const summary = ref<(BatchDoneEvent & { error?: string }) | null>(null)

const unsubscribers: Array<() => void> = []
let dragDepth = 0
let saveTimer: number | undefined

const trackMap = computed(() => {
  const map = new Map<string, TrackItem>()
  for (const item of tracks.value) map.set(item.id, item)
  return map
})

const total = computed(() => tracks.value.length)

const doneCount = computed(
  () => tracks.value.filter((item) => item.status === 'done').length
)

const failedCount = computed(
  () => tracks.value.filter((item) => item.status === 'error').length
)

const pendingCount = computed(
  () => tracks.value.filter((item) => item.status !== 'done' && !item.error).length
)

const totalDuration = computed(() =>
  tracks.value.reduce((sum, item) => sum + (item.duration || 0), 0)
)

const canStart = computed(
  () =>
    !running.value &&
    !scanning.value &&
    pendingCount.value > 0 &&
    Boolean(appInfo.value?.ffmpegReady)
)

const overall = computed(() => {
  if (!tracks.value.length) return 0
  const sum = tracks.value.reduce(
    (acc, item) => acc + (item.status === 'done' ? 100 : item.progress),
    0
  )
  return sum / tracks.value.length
})

function findTrack(id: string): TrackItem | undefined {
  return trackMap.value.get(id)
}

function toTrack(meta: AudioMeta): TrackItem {
  return {
    ...meta,
    status: meta.error ? 'error' : 'ready',
    progress: 0,
    message: meta.error,
    outputPath: '',
    outputSize: 0
  }
}

function toAudioMeta(item: TrackItem): AudioMeta {
  return {
    id: item.id,
    path: item.path,
    name: item.name,
    ext: item.ext,
    size: item.size,
    duration: item.duration,
    bitrate: item.bitrate,
    sampleRate: item.sampleRate,
    channels: item.channels,
    title: item.title,
    artist: item.artist,
    album: item.album,
    hasCover: item.hasCover,
    error: item.error
  }
}

async function importPaths(paths: string[]): Promise<void> {
  if (!paths.length || scanning.value) return
  scanning.value = true
  try {
    const result = await window.api.scanPaths(paths)
    const existing = new Set(tracks.value.map((item) => item.path.toLowerCase()))
    const fresh = result.files
      .filter((file) => !existing.has(file.path.toLowerCase()))
      .map(toTrack)

    if (!fresh.length) {
      toast.info(
        result.files.length > 0 ? '这些文件已经在列表中了' : '没有找到可处理的音频文件'
      )
      return
    }

    tracks.value = [...tracks.value, ...fresh]
    const unreadable = fresh.filter((item) => item.error).length
    toast.success(
      `已导入 ${fresh.length} 个文件${unreadable > 0 ? `（${unreadable} 个无法解析）` : ''}`
    )
    if (result.skipped > 0) {
      toast.info(`已跳过 ${result.skipped} 个不支持的文件`)
    }
  } catch (error) {
    toast.error(`导入失败：${String((error as Error)?.message ?? error)}`)
  } finally {
    scanning.value = false
  }
}

async function pickFiles(): Promise<void> {
  if (running.value) return
  const paths = await window.api.pickAudioFiles()
  if (paths.length) await importPaths(paths)
}

async function pickFolder(): Promise<void> {
  if (running.value) return
  const paths = await window.api.pickInputDirs()
  if (paths.length) await importPaths(paths)
}

function removeTrack(id: string): void {
  tracks.value = tracks.value.filter((item) => item.id !== id)
}

function clearAll(): void {
  if (running.value) return
  tracks.value = []
  summary.value = null
}

function clearDone(): void {
  if (running.value) return
  tracks.value = tracks.value.filter((item) => item.status !== 'done')
}

async function start(): Promise<void> {
  if (running.value) return
  if (!appInfo.value?.ffmpegReady) {
    toast.error('未检测到 ffmpeg，无法处理音频')
    return
  }
  if (options.value.outputMode === 'custom' && !options.value.outputDir) {
    toast.warning('请先在左侧选择一个输出目录')
    return
  }

  const targets = tracks.value.filter((item) => item.status !== 'done' && !item.error)
  if (!targets.length) {
    toast.warning('没有需要处理的文件')
    return
  }

  for (const item of targets) {
    item.status = 'queued'
    item.progress = 0
    item.message = ''
    item.outputPath = ''
    item.outputSize = 0
  }

  summary.value = null
  running.value = true

  const result = await window.api.startConvert(
    targets.map(toAudioMeta),
    { ...options.value }
  )

  if (!result.ok) {
    running.value = false
    for (const item of targets) {
      if (item.status === 'queued') item.status = 'ready'
    }
    toast.error(result.message ?? '启动处理失败')
  }
}

async function cancel(): Promise<void> {
  if (!running.value) return
  await window.api.cancelConvert()
  toast.info('正在取消，等待当前文件结束…')
}

function reveal(path: string): void {
  void window.api.revealItem(path)
}

function openFile(path: string): void {
  void window.api.openPath(path)
}

/* ---------- 拖拽 ---------- */

function onDragEnter(event: DragEvent): void {
  event.preventDefault()
  if (running.value) return
  dragDepth += 1
  dragging.value = true
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(event: DragEvent): void {
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  if (running.value) {
    toast.warning('处理中无法继续导入，请等待完成')
    return
  }

  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths = files
    .map((file) => {
      try {
        return window.api.getPathForFile(file)
      } catch {
        return ''
      }
    })
    .filter((path) => Boolean(path))

  if (!paths.length) {
    toast.error('无法读取拖入的文件路径')
    return
  }
  await importPaths(paths)
}

/* ---------- 生命周期 ---------- */

onMounted(async () => {
  try {
    appInfo.value = await window.api.getAppInfo()
  } catch {
    appInfo.value = null
  }

  try {
    options.value = await window.api.getSettings()
  } catch {
    /* 使用默认值 */
  }

  // 浏览器预览模式：用演示列表填充界面（Electron 中该字段不存在）
  const preview = (window.api as MusicToolApi & { previewTracks?: TrackItem[] }).previewTracks
  if (preview?.length) {
    tracks.value = preview.map((item) => ({ ...item }))
  }

  unsubscribers.push(
    window.api.onProgress((payload) => {
      const item = findTrack(payload.id)
      if (!item) return
      if (item.status === 'queued' || item.status === 'ready') {
        item.status = 'running'
      }
      item.progress = Math.max(item.progress, payload.progress)
    })
  )

  unsubscribers.push(
    window.api.onItemStart((payload) => {
      const item = findTrack(payload.id)
      if (!item) return
      item.status = 'running'
      item.progress = Math.max(item.progress, 0.5)
    })
  )

  unsubscribers.push(
    window.api.onItemDone((payload) => {
      const item = findTrack(payload.id)
      if (!item) return
      item.status = 'done'
      item.progress = 100
      item.outputPath = payload.outputPath
      item.outputSize = payload.outputSize
      item.message = ''
    })
  )

  unsubscribers.push(
    window.api.onItemError((payload) => {
      const item = findTrack(payload.id)
      if (!item) return
      item.status = 'error'
      item.message = payload.message
      item.progress = 100
    })
  )

  unsubscribers.push(
    window.api.onBatchDone((payload) => {
      running.value = false
      summary.value = payload

      for (const item of tracks.value) {
        if (item.status === 'queued' || item.status === 'running') {
          item.status = payload.canceled ? 'canceled' : 'error'
          if (!payload.canceled) item.message = '任务未完成'
        }
      }

      if (payload.error) {
        toast.error(payload.error)
        return
      }

      const parts: string[] = [`成功 ${payload.succeeded}`]
      if (payload.failed > 0) parts.push(`失败 ${payload.failed}`)
      const detail = `${parts.join('，')} · 用时 ${formatClock(payload.elapsed)}`

      if (payload.canceled) {
        toast.warning(`已取消 · ${detail}`)
      } else if (payload.failed > 0) {
        toast.warning(`处理完成 · ${detail}`)
      } else {
        toast.success(`全部完成 · ${detail}`)
      }
    })
  )
})

onUnmounted(() => {
  for (const unsubscribe of unsubscribers) unsubscribe()
  window.clearTimeout(saveTimer)
})

watch(
  options,
  () => {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      void window.api.saveSettings({ ...options.value })
    }, 420)
  },
  { deep: true }
)
</script>

<template>
  <div class="app">
    <AppTitleBar :app-info="appInfo" />

    <div class="app-body">
      <aside class="sidebar">
        <SettingsPanel v-model="options" :disabled="running" />
      </aside>

      <section class="workspace">
        <header class="toolbar">
          <button class="btn" :disabled="running" @click="pickFiles">
            <Icon name="plus" :size="15" />
            导入音频
          </button>
          <button class="btn btn-ghost" :disabled="running" @click="pickFolder">
            <Icon name="folder" :size="15" />
            文件夹
          </button>
          <button
            class="btn btn-ghost"
            :disabled="!total || running"
            @click="clearAll"
          >
            <Icon name="trash" :size="15" />
            清空
          </button>

          <div class="spacer"></div>

          <span v-if="scanning" class="toolbar-info">
            <Icon name="refresh" :size="13" class="spin" />
            正在读取音频信息…
          </span>
          <span v-else-if="total" class="toolbar-info">
            {{ total }} 个文件 · {{ formatDuration(totalDuration) }}
          </span>
        </header>

        <div
          class="content"
          :class="{ 'is-dragging': dragging }"
          @dragenter="onDragEnter"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <DropZone
            v-if="!total"
            @pick="pickFiles"
            @pick-folder="pickFolder"
          />
          <TrackList
            v-else
            :tracks="tracks"
            :running="running"
            @remove="removeTrack"
            @reveal="reveal"
            @open="openFile"
          />

          <div v-if="dragging" class="drop-overlay">
            <div class="overlay-inner">
              <Icon name="plus" :size="26" />
              <span>松开以导入音频</span>
            </div>
          </div>
        </div>

        <footer class="statusbar">
          <div class="stats">
            <span class="stat">
              <strong>{{ total }}</strong> 个文件
            </span>
            <span class="stat ok" v-if="doneCount > 0">
              <strong>{{ doneCount }}</strong> 已完成
            </span>
            <span class="stat bad" v-if="failedCount > 0">
              <strong>{{ failedCount }}</strong> 失败
            </span>
          </div>

          <div class="progress-area" v-if="running || (summary && !summary.error)">
            <div class="bar">
              <div class="fill" :style="{ width: `${overall}%` }"></div>
            </div>
            <span class="percent mono">{{ Math.round(overall) }}%</span>
          </div>

          <div class="spacer"></div>

          <button
            v-if="doneCount > 0 && !running"
            class="btn btn-ghost"
            @click="clearDone"
          >
            清除已完成
          </button>

          <button v-if="!running" class="btn btn-primary action" :disabled="!canStart" @click="start">
            <Icon name="play" :size="14" />
            开始处理
            <span v-if="pendingCount" class="count-badge">{{ pendingCount }}</span>
          </button>
          <button v-else class="btn btn-danger action" @click="cancel">
            <Icon name="stop" :size="13" />
            取消处理
          </button>
        </footer>
      </section>
    </div>

    <ToastStack />
  </div>
</template>

<style scoped lang="scss">
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.sidebar {
  width: 318px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
}

.workspace {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: radial-gradient(120% 100% at 85% 0%, rgba(124, 92, 255, 0.08), transparent 55%),
    radial-gradient(90% 80% at 0% 100%, rgba(34, 211, 238, 0.05), transparent 60%),
    var(--bg);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 18px;
  flex: none;
  border-bottom: 1px solid var(--border);

  .btn {
    height: 32px;
    font-size: 12.5px;
    padding: 0 12px;
  }
}

.spacer {
  flex: 1;
}

.toolbar-info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}

.content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.drop-overlay {
  position: absolute;
  inset: 10px;
  z-index: 20;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 2px dashed rgba(124, 92, 255, 0.7);
  background: rgba(20, 18, 40, 0.72);
  backdrop-filter: blur(6px);
  pointer-events: none;
  animation: pop-in 0.16s ease;
}

.overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #d9d2ff;
}

.statusbar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 0 18px;
  flex: none;
  border-top: 1px solid var(--border);
  background: rgba(10, 12, 17, 0.7);
}

.stats {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat {
  font-size: 12px;
  color: var(--text-3);

  strong {
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  &.ok strong {
    color: var(--success);
  }
  &.bad strong {
    color: var(--danger);
  }
}

.progress-area {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(300px, 34vw);
}

.bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.07);
}

.fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #8b6cff, #22d3ee);
  transition: width 0.25s ease;
}

.percent {
  font-size: 11.5px;
  color: var(--text-2);
  min-width: 34px;
  text-align: right;
}

.action {
  height: 38px;
  min-width: 136px;
  justify-content: center;
  font-size: 13px;
}

.count-badge {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10.5px;
  background: rgba(255, 255, 255, 0.22);
}
</style>
