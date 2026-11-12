import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
const isDev = !app.isPackaged

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 660,
    show: false,
    frame: false,
    roundedCorners: true,
    backgroundColor: '#0b0d12',
    title: '音乐批量处理器',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  const notifyMaximized = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send('window:maximized-changed', {
        isMaximized: window.isMaximized()
      })
    }
  }
  window.on('maximize', notifyMaximized)
  window.on('unmaximize', notifyMaximized)

  // 阻止页面被拖拽导航到外部地址
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

function registerWindowHandlers(): void {
  registerIpcHandlers(() => mainWindow)
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  Menu.setApplicationMenu(null)

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  registerWindowHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
