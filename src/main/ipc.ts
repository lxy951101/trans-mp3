import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type {
  AppInfo,
  AudioMeta,
  ConvertOptions,
  ScanResult
} from '@shared/types'
import { getFfmpegVersion, resolveBinaries } from './audio/ffmpeg'
import { BatchProcessor } from './audio/processor'
import { scanPaths } from './scan'
import { loadOptions, saveOptions, sanitize } from './settings'

/** 注册全部 IPC 处理器 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  const binaries = resolveBinaries()
  const processor = new BatchProcessor(
    binaries,
    join(app.getPath('temp'), 'music-tool')
  )

  let versionCache = ''

  ipcMain.handle('app:info', async (): Promise<AppInfo> => {
    if (!versionCache) {
      versionCache = await getFfmpegVersion(binaries)
    }
    return {
      version: app.getVersion(),
      platform: process.platform,
      ffmpegReady: Boolean(binaries.ffmpeg && binaries.ffprobe),
      ffmpegVersion: versionCache,
      ffmpegPath: binaries.ffmpeg ?? '',
      ffprobePath: binaries.ffprobe ?? ''
    }
  })

  ipcMain.handle('dialog:pick-files', async (): Promise<string[]> => {
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: '选择音频文件',
          properties: ['openFile', 'multiSelections'],
          filters: [
            {
              name: '音频文件',
              extensions: [
                'mp3',
                'flac',
                'wav',
                'aac',
                'm4a',
                'ogg',
                'opus',
                'wma',
                'aiff',
                'aif',
                'ape',
                'wv',
                'amr',
                'mp2',
                'm4b',
                'caf'
              ]
            }
          ]
        })
      : await dialog.showOpenDialog({
          title: '选择音频文件',
          properties: ['openFile', 'multiSelections']
        })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:pick-output-dir', async (): Promise<string | null> => {
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: '选择输出目录',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: '选择输出目录',
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:pick-input-dirs', async (): Promise<string[]> => {
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: '选择包含音频的文件夹',
          properties: ['openDirectory', 'multiSelections']
        })
      : await dialog.showOpenDialog({
          title: '选择包含音频的文件夹',
          properties: ['openDirectory', 'multiSelections']
        })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle(
    'scan:paths',
    async (_event, paths: string[]): Promise<ScanResult> => {
      if (!Array.isArray(paths) || paths.length === 0) {
        return { files: [], skipped: 0 }
      }
      return scanPaths(paths.filter((p) => typeof p === 'string'), binaries)
    }
  )

  ipcMain.handle('settings:get', (): ConvertOptions => loadOptions())

  ipcMain.handle(
    'settings:save',
    (_event, options: ConvertOptions): ConvertOptions => saveOptions(options)
  )

  ipcMain.handle(
    'convert:start',
    async (
      event,
      items: AudioMeta[],
      options: ConvertOptions
    ): Promise<{ ok: boolean; message?: string }> => {
      if (!Array.isArray(items) || items.length === 0) {
        return { ok: false, message: '没有待处理的文件' }
      }
      if (processor.isRunning) {
        return { ok: false, message: '已有任务正在处理中' }
      }

      const safeOptions = sanitize(options)
      const sender = event.sender
      const send = (channel: string, payload: unknown): void => {
        if (!sender.isDestroyed()) sender.send(channel, payload)
      }

      void processor
        .run(items, safeOptions, {
          onProgress: (payload) => send('convert:progress', payload),
          onItemStart: (id) => send('convert:item-start', { id }),
          onItemDone: (payload) => send('convert:item-done', payload),
          onItemError: (payload) => send('convert:item-error', payload)
        })
        .then((summary) => send('convert:batch-done', summary))
        .catch((error: unknown) => {
          send('convert:batch-done', {
            total: items.length,
            succeeded: 0,
            failed: items.length,
            canceled: false,
            elapsed: 0,
            error: String((error as Error)?.message ?? '处理失败')
          })
        })

      return { ok: true }
    }
  )

  ipcMain.handle('convert:cancel', (): boolean => {
    processor.cancel()
    return true
  })

  ipcMain.handle('shell:open-path', async (_event, target: string): Promise<void> => {
    if (typeof target === 'string' && target) {
      await shell.openPath(target)
    }
  })

  ipcMain.handle('shell:reveal', (_event, target: string): void => {
    if (typeof target === 'string' && target) {
      shell.showItemInFolder(target)
    }
  })

  ipcMain.handle('window:minimize', (event): void => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', (event): boolean => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
    return window.isMaximized()
  })

  ipcMain.handle('window:close', (event): void => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:state', (event): { isMaximized: boolean } => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return { isMaximized: window?.isMaximized() ?? false }
  })
}
