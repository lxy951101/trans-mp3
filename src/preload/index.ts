import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MusicToolApi, Unsubscribe } from '@shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: MusicToolApi = {
  /** 应用与 ffmpeg 环境信息 */
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  /** 打开系统文件选择框 */
  pickAudioFiles: () => ipcRenderer.invoke('dialog:pick-files'),

  /** 打开输出目录选择框 */
  pickOutputDir: () => ipcRenderer.invoke('dialog:pick-output-dir'),

  /** 打开输入文件夹选择框 */
  pickInputDirs: () => ipcRenderer.invoke('dialog:pick-input-dirs'),

  /** 扫描拖入的文件 / 文件夹 */
  scanPaths: (paths) => ipcRenderer.invoke('scan:paths', paths),

  /** 读取已保存的设置 */
  getSettings: () => ipcRenderer.invoke('settings:get'),

  /** 保存设置 */
  saveSettings: (options) => ipcRenderer.invoke('settings:save', options),

  /** 开始批量转换 */
  startConvert: (items, options) =>
    ipcRenderer.invoke('convert:start', items, options),

  /** 取消当前批次 */
  cancelConvert: () => ipcRenderer.invoke('convert:cancel'),

  /** 用系统默认程序打开文件 */
  openPath: (target) => ipcRenderer.invoke('shell:open-path', target),

  /** 在资源管理器中定位文件 */
  revealItem: (target) => ipcRenderer.invoke('shell:reveal', target),

  /** 拖拽进来的 File 对象 → 磁盘绝对路径 */
  getPathForFile: (file) => webUtils.getPathForFile(file),

  /** 窗口控制 */
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getWindowState: () => ipcRenderer.invoke('window:state'),

  /** 事件订阅 */
  onProgress: (cb) => subscribe('convert:progress', cb),
  onItemStart: (cb) => subscribe('convert:item-start', cb),
  onItemDone: (cb) => subscribe('convert:item-done', cb),
  onItemError: (cb) => subscribe('convert:item-error', cb),
  onBatchDone: (cb) => subscribe('convert:batch-done', cb),
  onMaximizedChanged: (cb) => subscribe('window:maximized-changed', cb)
}

contextBridge.exposeInMainWorld('api', api)
