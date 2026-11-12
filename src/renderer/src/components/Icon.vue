<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    strokeWidth?: number
  }>(),
  { size: 16, strokeWidth: 1.7 }
)

const ICONS: Record<string, string[]> = {
  plus: ['M12 5v14', 'M5 12h14'],
  folder: [
    'M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l1.8 2h8A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z'
  ],
  trash: [
    'M4 7h16',
    'M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7',
    'M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7'
  ],
  play: ['M8.5 5.8v12.4L19 12z'],
  stop: ['M7 7h10v10H7z'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  minus: ['M5 12h14'],
  square: ['M6 6h12v12H6z'],
  restore: [
    'M8.5 8.5V6.4A1.4 1.4 0 0 1 9.9 5h7.7A1.4 1.4 0 0 1 19 6.4v7.7a1.4 1.4 0 0 1-1.4 1.4h-2.1',
    'M5 9.9A1.4 1.4 0 0 1 6.4 8.5h7.7A1.4 1.4 0 0 1 15.5 9.9v7.7a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 17.6z'
  ],
  music: [
    'M9 18.2V6.3l10-2v11.4',
    'M6.5 18.2a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    'M16.5 15.7a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'
  ],
  check: ['M4.5 12.5l4.5 4.5L19.5 6.5'],
  alert: ['M12 8v5', 'M12 16.6v.01', 'M12 3.2l9 16.3H3z'],
  refresh: [
    'M20 11.5a8 8 0 1 0-2.3 6.6',
    'M20 4v7h-7'
  ],
  sliders: [
    'M4 7h9',
    'M17 7h3',
    'M4 12h3',
    'M11 12h9',
    'M4 17h9',
    'M17 17h3',
    'M13 5v4',
    'M7 10v4',
    'M13 15v4'
  ],
  wave: [
    'M3 12h2.2l1.8-5.4 3 12 3-9.2 2 4.6H21'
  ],
  external: [
    'M14 4h6v6',
    'M20 4l-8.5 8.5',
    'M10.5 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4.5'
  ],
  sparkle: [
    'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z',
    'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'
  ],
  volumn: [
    'M4 9.5v5h3l4 3.5V6L7 9.5z',
    'M15 9a4 4 0 0 1 0 6',
    'M17.5 6.5a7.5 7.5 0 0 1 0 11'
  ],
  clock: ['M12 7.5V12l3 2', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z'],
  info: ['M12 11v6', 'M12 7.5v.01', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z'],
  file: [
    'M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z',
    'M13.5 3.5V9H19'
  ]
}

const paths = computed(() => ICONS[props.name] ?? ICONS.file ?? [])
const filled = computed(
  () => props.name === 'play' || props.name === 'stop' || props.name === 'square'
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="filled ? 0 : strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>
