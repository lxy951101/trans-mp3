<script setup lang="ts">
import { computed } from 'vue'
import type { ConvertOptions } from '@shared/types'
import { BITRATE_OPTIONS, DEFAULT_OPTIONS, WATERMARK_PRESETS } from '@shared/options'
import Icon from './Icon.vue'
import { toast } from '../composables/useToast'

const options = defineModel<ConvertOptions>({ required: true })

const props = defineProps<{
  disabled: boolean
}>()

const volumeLabel = computed(() => {
  const volume = options.value.watermarkVolume
  if (volume <= -52) return '极轻'
  if (volume <= -40) return '很轻'
  if (volume <= -32) return '轻'
  return '较明显'
})

const presetHint = computed(
  () => WATERMARK_PRESETS.find((p) => p.value === options.value.watermarkPreset)?.hint ?? ''
)

function setBitrate(value: ConvertOptions['bitrate']): void {
  if (props.disabled) return
  options.value.bitrate = value
}

function setSampleRate(value: ConvertOptions['sampleRate']): void {
  if (props.disabled) return
  options.value.sampleRate = value
}

function setPreset(value: ConvertOptions['watermarkPreset']): void {
  if (props.disabled) return
  options.value.watermarkPreset = value
}

function setOutputMode(value: ConvertOptions['outputMode']): void {
  if (props.disabled) return
  options.value.outputMode = value
}

function toggleWatermark(): void {
  if (props.disabled) return
  options.value.watermarkEnabled = !options.value.watermarkEnabled
}

function toggleOverwrite(): void {
  if (props.disabled) return
  options.value.overwrite = !options.value.overwrite
}

function toggleCopyTags(): void {
  if (props.disabled) return
  options.value.copyTags = !options.value.copyTags
}

async function pickOutputDir(): Promise<void> {
  if (props.disabled) return
  const dir = await window.api.pickOutputDir()
  if (dir) {
    options.value.outputDir = dir
    options.value.outputMode = 'custom'
  }
}

function resetOptions(): void {
  if (props.disabled) return
  options.value = { ...DEFAULT_OPTIONS }
  toast.info('已恢复默认设置')
}
</script>

<template>
  <div class="settings" :class="{ disabled }">
    <div class="panel-head">
      <Icon name="sliders" :size="15" />
      <span>处理设置</span>
    </div>

    <div class="panel-body">
      <!-- 输出格式 -->
      <section class="group">
        <h3 class="group-title">输出格式</h3>

        <div class="field">
          <label class="field-label">目标格式</label>
          <div class="format-card">
            <span class="format-badge">MP3</span>
            <div class="format-info">
              <strong>高品质 MP3</strong>
              <span>兼容性最好，体积适中</span>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">码率</label>
          <div class="segmented">
            <button
              v-for="item in BITRATE_OPTIONS"
              :key="item.value"
              class="seg"
              :class="{ active: options.bitrate === item.value }"
              :title="item.hint"
              @click="setBitrate(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label">采样率</label>
          <div class="segmented">
            <button
              class="seg"
              :class="{ active: options.sampleRate === 44100 }"
              @click="setSampleRate(44100)"
            >
              44.1 kHz
            </button>
            <button
              class="seg"
              :class="{ active: options.sampleRate === 48000 }"
              @click="setSampleRate(48000)"
            >
              48 kHz
            </button>
          </div>
        </div>
      </section>

      <!-- 输出位置 -->
      <section class="group">
        <h3 class="group-title">输出位置</h3>

        <div class="radio-list">
          <button
            class="radio-item"
            :class="{ active: options.outputMode === 'beside' }"
            @click="setOutputMode('beside')"
          >
            <span class="radio-dot"></span>
            <div class="radio-text">
              <strong>源文件所在目录</strong>
              <span>与源文件并排输出，方便对比</span>
            </div>
          </button>

          <button
            class="radio-item"
            :class="{ active: options.outputMode === 'custom' }"
            @click="setOutputMode('custom')"
          >
            <span class="radio-dot"></span>
            <div class="radio-text">
              <strong>指定目录</strong>
              <span class="path" :title="options.outputDir">
                {{ options.outputDir || '尚未选择目录' }}
              </span>
            </div>
          </button>
        </div>

        <button class="btn btn-ghost pick-btn" @click="pickOutputDir">
          <Icon name="folder" :size="14" />
          选择输出目录
        </button>

        <div class="field">
          <label class="field-label">文件名后缀</label>
          <input
            v-model="options.suffix"
            class="input"
            type="text"
            maxlength="40"
            :disabled="disabled"
            placeholder="例如 _processed"
          />
        </div>

        <div class="switch-row">
          <div>
            <strong>允许覆盖同名文件</strong>
            <span>关闭时自动追加 (2)、(3) 避免丢失</span>
          </div>
          <span class="switch" :class="{ on: options.overwrite }" @click="toggleOverwrite"></span>
        </div>

        <div class="switch-row">
          <div>
            <strong>保留元数据与封面</strong>
            <span>复制标题、艺术家与内嵌封面</span>
          </div>
          <span class="switch" :class="{ on: options.copyTags }" @click="toggleCopyTags"></span>
        </div>
      </section>

      <!-- 标记音效 -->
      <section class="group">
        <h3 class="group-title">
          尾部标记音效
          <span class="title-tag">差异指纹</span>
        </h3>

        <div class="switch-row">
          <div>
            <strong>追加 1 秒标记音效</strong>
            <span>输出比原文件多 1 秒，形成可检测差异</span>
          </div>
          <span
            class="switch"
            :class="{ on: options.watermarkEnabled }"
            @click="toggleWatermark"
          ></span>
        </div>

        <div v-if="options.watermarkEnabled" class="watermark-body">
          <div class="field">
            <label class="field-label">隐蔽程度</label>
            <div class="segmented">
              <button
                v-for="item in WATERMARK_PRESETS"
                :key="item.value"
                class="seg"
                :class="{ active: options.watermarkPreset === item.value }"
                @click="setPreset(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
            <p class="hint">{{ presetHint }}</p>
          </div>

          <div class="field">
            <div class="volume-head">
              <label class="field-label">音效电平</label>
              <span class="volume-value mono">{{ options.watermarkVolume }} dBFS</span>
            </div>
            <input
              v-model.number="options.watermarkVolume"
              class="range"
              type="range"
              min="-60"
              max="-24"
              step="1"
              :disabled="disabled"
            />
            <p class="hint">
              当前：{{ volumeLabel }}。数值越低越难察觉，建议保持在 -40 dBFS 以下。
            </p>
          </div>
        </div>
      </section>

      <!-- 性能 -->
      <section class="group">
        <h3 class="group-title">性能</h3>
        <div class="field">
          <div class="volume-head">
            <label class="field-label">同时处理数量</label>
            <span class="volume-value mono">{{ options.concurrency }}</span>
          </div>
          <input
            v-model.number="options.concurrency"
            class="range"
            type="range"
            min="1"
            max="4"
            step="1"
            :disabled="disabled"
          />
          <p class="hint">并发越高越快，但会占用更多 CPU。</p>
        </div>
      </section>

      <button class="btn btn-ghost reset-btn" @click="resetOptions">
        <Icon name="refresh" :size="14" />
        恢复默认设置
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  &.disabled .panel-body {
    opacity: 0.6;
  }

  &.disabled :is(button, input, .switch) {
    pointer-events: none;
  }
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 18px;
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.02em;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--panel);
  border: 1px solid var(--border);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-2);
  letter-spacing: 0.04em;
}

.title-tag {
  padding: 2px 7px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-2);
  background: rgba(34, 211, 238, 0.12);
  border: 1px solid rgba(34, 211, 238, 0.24);
}

.format-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
  border: 1px solid var(--border);
}

.format-badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 32px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fff;
  background: linear-gradient(135deg, #8b6cff, #5b8cff);
  box-shadow: 0 4px 12px var(--accent-glow);
}

.format-info {
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    font-size: 12.5px;
  }
  span {
    font-size: 11px;
    color: var(--text-3);
  }
}

.segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
}

.seg {
  height: 28px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.04);
  }

  &.active {
    color: #fff;
    background: linear-gradient(135deg, rgba(139, 108, 255, 0.9), rgba(91, 140, 255, 0.9));
    box-shadow: 0 4px 12px rgba(109, 77, 255, 0.3);
  }
}

.radio-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 11px;
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: var(--border-strong);
  }

  &.active {
    border-color: rgba(124, 92, 255, 0.55);
    background: rgba(124, 92, 255, 0.09);

    .radio-dot {
      border-color: var(--accent);
      &::after {
        transform: scale(1);
      }
    }
  }
}

.radio-dot {
  position: relative;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  flex: none;
  border-radius: 50%;
  border: 1.5px solid #414a60;

  &::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--accent);
    transform: scale(0);
    transition: transform 0.15s ease;
  }
}

.radio-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  strong {
    font-size: 12.5px;
    font-weight: 500;
  }
  span {
    font-size: 11px;
    color: var(--text-3);
  }

  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.pick-btn {
  align-self: flex-start;
  height: 30px;
  font-size: 12px;
  padding: 0 10px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    display: block;
    font-size: 12.5px;
    font-weight: 500;
  }
  span {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: var(--text-3);
    line-height: 1.4;
  }
}

.watermark-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.volume-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.volume-value {
  font-size: 11.5px;
  color: var(--accent-2);
}

.hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-3);
  font-weight: 400;
}

.reset-btn {
  align-self: center;
  font-size: 12px;
  color: var(--text-3);

  &:hover {
    color: var(--text-2);
  }
}
</style>
