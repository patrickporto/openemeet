import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc.js'
import { settings } from './store/settings.js'
import { launchedAtLogin } from './system/autostart.js'
import { isTrayLive } from './tray-state.js'

let mainWindow: BrowserWindow | null = null
/** Set on app.quit so the close handler stops diverting to the tray. */
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  // Login launches stay out of the way, like an explicit start-minimised.
  const startMinimized = settings().get('startMinimized') || launchedAtLogin()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    // Matches the shell background so the first paint is not a white flash.
    backgroundColor: '#0E0F13',
    icon: join(__dirname, '../../resources/icon-256.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    // Never start hidden without a tray icon to bring the window back.
    if (!startMinimized || !isTrayLive()) mainWindow?.show()
  })

  const emitMaximize = () =>
    mainWindow?.webContents.send(IPC.windowMaximizeChange, mainWindow.isMaximized())
  mainWindow.on('maximize', emitMaximize)
  mainWindow.on('unmaximize', emitMaximize)

  mainWindow.on('close', (event) => {
    // Hiding is only safe when a tray icon can bring the window back.
    if (!quitting && settings().get('closeToTray') && isTrayLive()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Links open in the user's browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void mainWindow.loadURL(devServer)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function showMainWindow(navigate?: { cameraId?: string; tab?: string }): void {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (navigate) win.webContents.send(IPC.navigate, navigate)
}
