<script setup lang="ts">
import type { TrackItem } from '@shared/types'
import TrackRow from './TrackRow.vue'

defineProps<{
  tracks: TrackItem[]
  running: boolean
}>()

const emit = defineEmits<{
  (event: 'remove', id: string): void
  (event: 'reveal', path: string): void
  (event: 'open', path: string): void
}>()
</script>

<template>
  <div class="list">
    <div class="thead">
      <span class="th-index">#</span>
      <span class="th-main">文件名</span>
      <span class="th-num">时长</span>
      <span class="th-num">大小</span>
      <span class="th-num">状态</span>
      <span></span>
    </div>

    <div class="tbody">
      <TrackRow
        v-for="(item, index) in tracks"
        :key="item.id"
        :item="item"
        :index="index"
        :running="running"
        @remove="emit('remove', $event)"
        @reveal="emit('reveal', $event)"
        @open="emit('open', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.thead {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 62px 72px 104px 66px;
  align-items: center;
  gap: 10px;
  padding: 9px 16px;
  flex: none;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-3);
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.015);
  border-bottom: 1px solid var(--border);
}

.th-main {
  text-align: left;
}

.th-num {
  text-align: right;
}

.th-index {
  text-align: center;
}

.tbody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
