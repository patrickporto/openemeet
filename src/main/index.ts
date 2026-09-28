import { BrowserWindow, app } from 'electron'
import { IPC } from '../shared/ipc.js'
import { cameraManager } from './devices/manager.js'
import { broadcast, registerIpcHandlers } from './ipc.js'
import { createTray, destroyTray, hasTray, refreshTrayMenu } from './tray.js'
import { createMainWindow, markQuitting, showMainWindow } from './window.js'
import { log } from './logger.js'

// A second launch should surface the running instance, not start another app.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  // Identifies the app to the desktop shell so the icon and grouping work.
  app.setName('openemeet')
  if (process.platform === 'linux') app.setDesktopName('openemeet.desktop')

  await app.whenReady()

  registerIpcHandlers()

  cameraManager.on('changed', (cameras) => broadcast(IPC.camerasChanged, cameras))
  cameraManager.startWatching()
  await cameraManager.refresh()

  createMainWindow()
  createTray()
  refreshTrayMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else showMainWindow()
  })

  app.on('before-quit', () => {
    markQuitting()
    cameraManager.stop()
    destroyTray()
  })

  // Staying resident is only safe when a tray icon exists to bring us back;
  // without one the app would become an invisible zombie process.
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return
    if (!hasTray()) app.quit()
  })

  log.info('openemeet ready')
}

process.on('uncaughtException', (err) => log.error('Uncaught exception:', err))
process.on('unhandledRejection', (err) => log.error('Unhandled rejection:', err))
