<script setup lang="ts">
import Icon from './Icon.vue'

defineEmits<{
  (event: 'pick'): void
  (event: 'pick-folder'): void
}>()

const FORMATS = ['MP3', 'FLAC', 'WAV', 'M4A', 'AAC', 'OGG', 'APE', 'WMA']
</script>

<template>
  <div class="dropzone">
    <div class="orb">
      <span class="ring ring-1"></span>
      <span class="ring ring-2"></span>
      <span class="ring ring-3"></span>
      <span class="orb-core">
        <Icon name="music" :size="38" :stroke-width="1.4" />
      </span>
    </div>

    <h2>把音频拖到这里</h2>
    <p class="sub">
      支持单个文件、多选文件，或直接拖入整个文件夹
    </p>

    <div class="actions">
      <button class="btn btn-primary" @click="$emit('pick')">
        <Icon name="plus" :size="16" />
        选择音频文件
      </button>
      <button class="btn" @click="$emit('pick-folder')">
        <Icon name="folder" :size="15" />
        导入文件夹
      </button>
    </div>

    <div class="formats">
      <span v-for="format in FORMATS" :key="format" class="chip">{{ format }}</span>
      <span class="chip more">等 16 种格式</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  height: 100%;
  min-height: 360px;
  padding: 24px;
  text-align: center;
}

.orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 168px;
  height: 168px;
  margin-bottom: 26px;
}

.orb-core {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: 28px;
  color: #fff;
  background: linear-gradient(135deg, #8b6cff 0%, #5b8cff 55%, #22d3ee 100%);
  box-shadow: 0 18px 46px rgba(109, 77, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
  z-index: 2;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(124, 92, 255, 0.28);
  animation: pulse 3.4s ease-out infinite;
}

.ring-1 {
  width: 118px;
  height: 118px;
  animation-delay: 0s;
}
.ring-2 {
  width: 148px;
  height: 148px;
  animation-delay: 0.9s;
}
.ring-3 {
  width: 178px;
  height: 178px;
  animation-delay: 1.8s;
}

@keyframes pulse {
  0% {
    opacity: 0.15;
    transform: scale(0.82);
  }
  55% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    transform: scale(1.06);
  }
}

h2 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text);
}

.sub {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-3);
  font-weight: 400;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.formats {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: 26px;
  max-width: 420px;
}

.chip {
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--text-3);
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--border);

  &.more {
    color: var(--text-2);
    border-color: var(--border-strong);
  }
}
</style>
