<script setup lang="ts">
import { computed } from 'vue'
import type { TrackItem, TrackStatus } from '@shared/types'
import Icon from './Icon.vue'
import {
  formatDuration,
  formatSampleRate,
  formatSize
} from '../utils/format'

const props = defineProps<{
  item: TrackItem
  index: number
  running: boolean
}>()

const emit = defineEmits<{
  (event: 'remove', id: string): void
  (event: 'reveal', path: string): void
  (event: 'open', path: string): void
}>()

const STATUS_TEXT: Record<TrackStatus, string> = {
  ready: '待处理',
  queued: '排队中',
  running: '转换中',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}

const statusText = computed(() => {
  const base = STATUS_TEXT[props.item.status]
  if (props.item.status === 'running') {
    return `${base} ${Math.round(props.item.progress)}%`
  }
  return base
})

const progress = computed(() => {
  if (props.item.status === 'done') return 100
  return Math.max(0, Math.min(100, props.item.progress))
})

const removable = computed(
  () => !props.running || (props.item.status !== 'running' && props.item.status !== 'queued')
)

const canReveal = computed(
  () => props.item.status === 'done' && Boolean(props.item.outputPath)
)

const metaText = computed(() => {
  if (props.item.error) return props.item.error
  const parts: string[] = [props.item.ext.toUpperCase()]
  if (props.item.artist) parts.push(props.item.artist)
  if (props.item.sampleRate > 0) {
    parts.push(formatSampleRate(props.item.sampleRate))
  }
  if (props.item.channels > 0) {
    parts.push(`${props.item.channels} 声道`)
  }
  return parts.join(' · ')
})

function reveal(): void {
  if (props.item.outputPath) emit('reveal', props.item.outputPath)
}
</script>

<template>
  <div class="row" :class="item.status">
    <div class="index">
      <span v-if="item.status === 'done'" class="badge done">
        <Icon name="check" :size="13" :stroke-width="2.4" />
      </span>
      <span v-else-if="item.status === 'error'" class="badge error">
        <Icon name="alert" :size="12" />
      </span>
      <span v-else-if="item.status === 'running'" class="badge running">
        <span class="dot"></span>
      </span>
      <span v-else class="num">{{ index + 1 }}</span>
    </div>

    <div class="main" :title="item.path">
      <div class="name">{{ item.name }}</div>
      <div class="meta" :class="{ err: Boolean(item.error) }">{{ metaText }}</div>
    </div>

    <div class="col duration mono">{{ formatDuration(item.duration) }}</div>
    <div class="col size mono">{{ formatSize(item.size) }}</div>

    <div class="col status-col">
      <span class="status" :class="item.status">{{ statusText }}</span>
    </div>

    <div class="col actions">
      <button v-if="canReveal" class="icon-btn" title="在文件夹中显示" @click="reveal">
        <Icon name="external" :size="14" />
      </button>
      <button
        v-if="removable"
        class="icon-btn danger"
        title="移除"
        @click="emit('remove', item.id)"
      >
        <Icon name="trash" :size="14" />
      </button>
    </div>

    <div v-if="item.status !== 'ready'" class="progress-track">
      <div
        class="progress-fill"
        :class="{ done: item.status === 'done', error: item.status === 'error' }"
        :style="{ width: `${progress}%` }"
      ></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.row {
  position: relative;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 62px 72px 104px 66px;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.14s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.022);
  }

  &.running {
    background: rgba(124, 92, 255, 0.06);
  }

  &.done .name {
    color: var(--text-2);
  }
}

.index {
  display: flex;
  align-items: center;
  justify-content: center;
}

.num {
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.badge {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;

  &.done {
    color: var(--success);
    background: var(--success-soft);
  }
  &.error {
    color: var(--danger);
    background: var(--danger-soft);
  }
  &.running {
    background: var(--accent-soft);

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      animation: blink 1.1s ease-in-out infinite;
    }
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

.main {
  min-width: 0;
}

.name {
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.err {
    color: var(--danger);
  }
}

.col {
  font-size: 11.5px;
  color: var(--text-3);
  text-align: right;
}

.duration {
  text-align: right;
}

.status-col {
  text-align: right;
}

.status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--text-3);
  background: rgba(255, 255, 255, 0.04);
  white-space: nowrap;

  &.running {
    color: #c4b5fd;
    background: rgba(124, 92, 255, 0.18);
  }
  &.queued {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.14);
  }
  &.done {
    color: var(--success);
    background: var(--success-soft);
  }
  &.error {
    color: var(--danger);
    background: var(--danger-soft);
  }
  &.canceled {
    color: var(--warning);
    background: var(--warning-soft);
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  padding: 0;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: var(--text-3);
  transition: background 0.14s ease, color 0.14s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--text);
  }
  &.danger:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }
}

.progress-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.03);
}

.progress-fill {
  height: 100%;
  border-radius: 0 2px 2px 0;
  background: linear-gradient(90deg, #8b6cff, #22d3ee);
  transition: width 0.2s linear;

  &.done {
    background: var(--success);
  }
  &.error {
    background: var(--danger);
  }
}
</style>
