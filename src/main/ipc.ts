import { BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import { IPC } from '../shared/ipc.js'
import type { AppSettings } from '../shared/types.js'
import { cameraManager } from './devices/manager.js'
import * as presets from './store/presets.js'
import { settings } from './store/settings.js'
import { UDEV_RULE_PATH, collectDiagnostics, udevInstallCommand } from './system/diagnostics.js'
import { log } from './logger.js'

/** Broadcasts an event to every open window. */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/**
 * Registers a handler, normalising thrown errors to a plain message so the
 * renderer can surface them directly in a toast.
 */
function handle<A extends unknown[], R>(
  channel: string,
  fn: (...args: A) => Promise<R> | R,
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...(args as A))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn(`${channel}:`, message)
      throw new Error(message)
    }
  })
}

export function registerIpcHandlers(): void {
  handle(IPC.camerasList, () => cameraManager.list())
  handle(IPC.camerasRefresh, () => cameraManager.refresh())

  handle(IPC.controlsList, (id: string, force: boolean) => cameraManager.get(id).listControls(force))
  handle(IPC.controlsSet, async (id: string, name: string, value: number) => {
    await cameraManager.get(id).setControl(name, value)
  })
  handle(IPC.controlsReset, async (id: string, name: string) => {
    await cameraManager.get(id).resetControl(name)
  })

  handle(IPC.ptzGet, (id: string) => cameraManager.get(id).getPtz())
  handle(IPC.ptzSet, async (id: string, position: Record<string, number>) => {
    const controller = cameraManager.get(id)
    await controller.setPtz(position)
    return controller.getPtz()
  })
  handle(IPC.ptzNudge, (id: string, axis: 'pan' | 'tilt', degrees: number) =>
    cameraManager.get(id).nudge(axis, degrees),
  )
  handle(IPC.ptzZoom, (id: string, delta: number) => cameraManager.get(id).zoomBy(delta))
  handle(IPC.ptzCenter, (id: string) => cameraManager.get(id).center())

  const publishState = (id: string) => {
    cameraManager.persistAll()
    broadcast(IPC.camerasChanged, cameraManager.list())
    return cameraManager.get(id).getState()
  }

  handle(IPC.smartTracking, async (id: string, mode: 'idle' | 'track' | 'privacy') => {
    await cameraManager.get(id).setTracking(mode)
    return publishState(id)
  })
  handle(IPC.smartPrivacyToggle, async (id: string) => {
    await cameraManager.get(id).togglePrivacy()
    return publishState(id)
  })
  handle(IPC.smartGesture, async (id: string, enabled: boolean) => {
    await cameraManager.get(id).setGesture(enabled)
    return publishState(id)
  })
  handle(IPC.smartAudio, async (id: string, mode: 'nc' | 'live' | 'org') => {
    await cameraManager.get(id).setAudio(mode)
    return publishState(id)
  })
  handle(IPC.smartAutoPrivacy, async (id: string, seconds: number) => {
    await cameraManager.get(id).setAutoPrivacy(seconds)
    return publishState(id)
  })
  handle(IPC.smartFlicker, async (id: string, mode: 'off' | '50' | '60') => {
    await cameraManager.get(id).setFlicker(mode)
  })
  handle(IPC.smartSync, async (id: string) => {
    await cameraManager.get(id).sync()
    return publishState(id)
  })

  // Preset edits change the tray menu and the UI. Re-emitting on the manager
  // reaches both without ipc <-> tray importing each other.
  const publishPresets = () => cameraManager.emit('changed', cameraManager.list())

  handle(IPC.presetsList, (id: string) => presets.listPresets(id))
  handle(IPC.presetsSave, async (id: string, name: string) => {
    const position = await cameraManager.get(id).getPtz()
    const saved = presets.savePreset(id, name, position)
    publishPresets()
    return saved
  })
  handle(IPC.presetsRename, (id: string, presetId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Preset name cannot be empty')
    const renamed = presets.updatePreset(id, presetId, { name: trimmed })
    publishPresets()
    return renamed
  })
  handle(IPC.presetsOverwrite, async (id: string, presetId: string) => {
    const position = await cameraManager.get(id).getPtz()
    const updated = presets.updatePreset(id, presetId, position)
    publishPresets()
    return updated
  })
  handle(IPC.presetsRemove, (id: string, presetId: string) => {
    presets.deletePreset(id, presetId)
    publishPresets()
  })
  handle(IPC.presetsApply, async (id: string, presetId: string) => {
    const preset = presets.listPresets(id).find((p) => p.id === presetId)
    if (!preset) throw new Error('Preset not found')

    const controller = cameraManager.get(id)
    const position = await controller.applyPreset(preset)
    broadcast(IPC.camerasChanged, cameraManager.list())
    return position
  })

  handle(IPC.settingsGet, () => settings().all)
  handle(IPC.settingsPatch, async (values: Partial<AppSettings>) => {
    const previous = settings().all
    const next = settings().patch(values)
    broadcast(IPC.settingsChanged, next)

    // Device visibility changed, so the camera list must be rebuilt.
    if (
      previous.mockDevices !== next.mockDevices ||
      (values as Record<string, unknown>).includeGenericCameras !== undefined
    ) {
      await cameraManager.refresh()
    }
    return next
  })

  handle(IPC.systemDiagnostics, () => collectDiagnostics())
  handle(IPC.systemUdevHelp, () => ({ command: udevInstallCommand(), rulePath: UDEV_RULE_PATH }))
  handle(IPC.systemClipboard, (text: string) => clipboard.writeText(text))
  handle(IPC.systemOpenExternal, async (url: string) => {
    // Only allow web links out of the app.
    if (!/^https?:\/\//i.test(url)) throw new Error('Refusing to open non-http URL')
    await shell.openExternal(url)
  })

  ipcMain.on(IPC.windowMinimize, (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.windowClose, (event) => BrowserWindow.fromWebContents(event.sender)?.close())
}
