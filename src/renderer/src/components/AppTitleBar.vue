<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { AppInfo } from '@shared/types'
import Icon from './Icon.vue'

defineProps<{
  appInfo: AppInfo | null
}>()

const maximized = ref(false)

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  const state = await window.api.getWindowState()
  maximized.value = state.isMaximized
  unsubscribe = window.api.onMaximizedChanged((payload) => {
    maximized.value = payload.isMaximized
  })
})

onUnmounted(() => {
  unsubscribe?.()
})

function minimize(): void {
  void window.api.minimizeWindow()
}

async function toggleMaximize(): Promise<void> {
  maximized.value = await window.api.toggleMaximizeWindow()
}

function close(): void {
  void window.api.closeWindow()
}
</script>

<template>
  <header class="titlebar">
    <div class="brand">
      <span class="logo">
        <Icon name="wave" :size="18" :stroke-width="2" />
      </span>
      <div class="brand-text">
        <h1>音乐批量处理器</h1>
        <p>批量转码 · 尾部标记音效</p>
      </div>
    </div>

    <div class="middle">
      <span v-if="appInfo && !appInfo.ffmpegReady" class="env-badge bad">
        <Icon name="alert" :size="12" />
        未检测到 ffmpeg
      </span>
      <span v-else-if="appInfo" class="env-badge ok">
        <span class="dot"></span>
        ffmpeg 就绪
      </span>
    </div>

    <div class="win-actions">
      <button class="win-btn" title="最小化" @click="minimize">
        <Icon name="minus" :size="14" :stroke-width="2" />
      </button>
      <button class="win-btn" :title="maximized ? '还原' : '最大化'" @click="toggleMaximize">
        <Icon :name="maximized ? 'restore' : 'square'" :size="13" :stroke-width="1.6" />
      </button>
      <button class="win-btn close" title="关闭" @click="close">
        <Icon name="x" :size="14" :stroke-width="2" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.titlebar {
  display: flex;
  align-items: center;
  height: 58px;
  padding-left: 18px;
  padding-right: 6px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(20, 24, 35, 0.92), rgba(12, 15, 22, 0.92));
  -webkit-app-region: drag;
  flex: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.logo {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, #8b6cff, #5b8cff 60%, #22d3ee);
  box-shadow: 0 6px 18px var(--accent-glow);
}

.brand-text {
  h1 {
    font-size: 14px;
    letter-spacing: 0.02em;
  }
  p {
    margin-top: 1px;
    font-size: 11px;
    color: var(--text-3);
    font-weight: 400;
  }
}

.middle {
  flex: 1;
  display: flex;
  justify-content: center;
}

.env-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 20px;
  font-size: 11.5px;
  border: 1px solid var(--border);
  color: var(--text-2);

  &.ok .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 8px var(--success);
  }
  &.bad {
    color: var(--warning);
    border-color: rgba(251, 191, 36, 0.3);
    background: var(--warning-soft);
  }
}

.win-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.win-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 34px;
  border-radius: 8px;
  color: var(--text-2);
  transition: background 0.14s ease, color 0.14s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--text);
  }

  &.close:hover {
    background: #e5484d;
    color: #fff;
  }
}
</style>
