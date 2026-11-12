<script setup lang="ts">
import { useToast, type ToastKind } from '../composables/useToast'
import Icon from './Icon.vue'

const { toasts, dismiss } = useToast()

const ICON_BY_KIND: Record<ToastKind, string> = {
  success: 'check',
  error: 'alert',
  warning: 'alert',
  info: 'info'
}
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast">
      <div
        v-for="item in toasts"
        :key="item.id"
        class="toast"
        :class="item.kind"
        @click="dismiss(item.id)"
      >
        <span class="toast-icon">
          <Icon :name="ICON_BY_KIND[item.kind]" :size="15" />
        </span>
        <span class="toast-text">{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.toast-stack {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  max-width: 420px;
  padding: 11px 15px;
  border-radius: 12px;
  background: rgba(22, 27, 38, 0.96);
  border: 1px solid var(--border-strong);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  pointer-events: auto;
  cursor: pointer;
  animation: pop-in 0.2s ease;

  &.success .toast-icon {
    color: var(--success);
  }
  &.error .toast-icon {
    color: var(--danger);
  }
  &.warning .toast-icon {
    color: var(--warning);
  }
  &.info .toast-icon {
    color: var(--accent-2);
  }
}

.toast-icon {
  display: inline-flex;
}

.toast-text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
</style>
