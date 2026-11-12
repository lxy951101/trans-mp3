import { ref } from 'vue'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const toasts = ref<ToastItem[]>([])
let seed = 0

function push(kind: ToastKind, message: string, duration = 3200): void {
  const id = ++seed
  toasts.value = [...toasts.value, { id, kind, message }]
  window.setTimeout(() => dismiss(id), duration)
}

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 4600),
  info: (message: string) => push('info', message),
  warning: (message: string) => push('warning', message, 4000)
}

export function useToast() {
  return { toasts, dismiss }
}
