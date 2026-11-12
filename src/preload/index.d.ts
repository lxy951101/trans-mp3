import type { MusicToolApi } from '@shared/api'

declare global {
  interface Window {
    api: MusicToolApi
  }
}

export {}
