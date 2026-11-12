import type {
  AppInfo,
  AudioMeta,
  BatchDoneEvent,
  ConvertOptions,
  ItemDoneEvent,
  ItemErrorEvent,
  ProgressEvent,
  ScanResult
} from './types'

export type Unsubscribe = () => void

/** preload 通过 contextBridge 暴露到 window.api 的接口 */
export interface MusicToolApi {
  getAppInfo(): Promise<AppInfo>
  pickAudioFiles(): Promise<string[]>
  pickOutputDir(): Promise<string | null>
  pickInputDirs(): Promise<string[]>
  scanPaths(paths: string[]): Promise<ScanResult>
  getSettings(): Promise<ConvertOptions>
  saveSettings(options: ConvertOptions): Promise<ConvertOptions>
  startConvert(
    items: AudioMeta[],
    options: ConvertOptions
  ): Promise<{ ok: boolean; message?: string }>
  cancelConvert(): Promise<boolean>
  openPath(target: string): Promise<void>
  revealItem(target: string): Promise<void>
  getPathForFile(file: File): string
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
  getWindowState(): Promise<{ isMaximized: boolean }>
  onProgress(cb: (payload: ProgressEvent) => void): Unsubscribe
  onItemStart(cb: (payload: { id: string }) => void): Unsubscribe
  onItemDone(cb: (payload: ItemDoneEvent) => void): Unsubscribe
  onItemError(cb: (payload: ItemErrorEvent) => void): Unsubscribe
  onBatchDone(cb: (payload: BatchDoneEvent & { error?: string }) => void): Unsubscribe
  onMaximizedChanged(cb: (payload: { isMaximized: boolean }) => void): Unsubscribe
}
