import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { Camera } from '../shared/types.js'
import { translator } from '../shared/i18n.js'
import { IPC } from '../shared/ipc.js'
import { cameraManager } from './devices/manager.js'
import { listPresets } from './store/presets.js'
import { settings } from './store/settings.js'
import { broadcast } from './ipc.js'
import { markQuitting, showMainWindow } from './window.js'
import { isTrayLive, setTrayLive } from './tray-state.js'
import { log } from './logger.js'

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  const image = nativeImage.createFromPath(join(__dirname, '../../resources/tray.png'))
  // Template images follow the panel's light/dark theme instead of fighting it.
  image.setTemplateImage(true)
  return image
}

/** Runs a camera action from the tray and refreshes the menu with the result. */
async function act(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
    broadcast(IPC.camerasChanged, cameraManager.list())
  } catch (err) {
    log.warn(`Tray action "${label}" failed:`, err instanceof Error ? err.message : err)
  }
  refreshTrayMenu()
}

function cameraSubmenu(camera: Camera): MenuItemConstructorOptions[] {
  const t = translator(settings().get('locale'))
  const id = camera.id
  const items: MenuItemConstructorOptions[] = []

  if (camera.capabilities.hid) {
    items.push(
      {
        label: t('tray.privacy'),
        type: 'checkbox',
        checked: camera.state.tracking === 'privacy',
        click: () => void act('privacy', () => cameraManager.get(id).togglePrivacy()),
      },
      {
        label: t('tray.tracking'),
        type: 'checkbox',
        checked: camera.state.tracking === 'track',
        click: () =>
          void act('tracking', () =>
            cameraManager.get(id).setTracking(camera.state.tracking === 'track' ? 'idle' : 'track'),
          ),
      },
      {
        label: t('tray.gesture'),
        type: 'checkbox',
        checked: camera.state.gesture === 'on',
        click: () =>
          void act('gesture', () => cameraManager.get(id).setGesture(camera.state.gesture !== 'on')),
      },
      { type: 'separator' },
      {
        label: t('tray.audio'),
        submenu: (['nc', 'live', 'org'] as const).map((mode) => ({
          label: t(`smart.audio.${mode}` as const),
          type: 'radio' as const,
          checked: camera.state.audio === mode,
          click: () => void act('audio', () => cameraManager.get(id).setAudio(mode)),
        })),
      },
    )
  }

  if (camera.capabilities.ptz) {
    const presets = listPresets(id)
    if (presets.length > 0) {
      items.push({
        label: t('tray.presets'),
        submenu: presets.map((preset) => ({
          label: preset.name,
          click: () =>
            void act('preset', () =>
              cameraManager
                .get(id)
                .setPtz({ pan: preset.pan, tilt: preset.tilt, zoom: preset.zoom }),
            ),
        })),
      })
    }
    items.push({
      label: t('tray.center'),
      click: () => void act('center', () => cameraManager.get(id).center()),
    })
  }

  items.push(
    { type: 'separator' },
    { label: t('tray.show'), click: () => showMainWindow({ cameraId: id }) },
  )

  return items
}

export function refreshTrayMenu(): void {
  if (!tray) return

  const t = translator(settings().get('locale'))
  const cameras = cameraManager.list()
  const template: MenuItemConstructorOptions[] = []

  if (cameras.length === 0) {
    template.push({ label: t('tray.noCameras'), enabled: false })
  } else if (cameras.length === 1) {
    // A single camera needs no nesting — put its actions at the top level.
    template.push({ label: cameras[0].label, enabled: false }, ...cameraSubmenu(cameras[0]))
  } else {
    for (const camera of cameras) {
      template.push({ label: camera.label, submenu: cameraSubmenu(camera) })
    }
  }

  template.push(
    { type: 'separator' },
    { label: t('tray.refresh'), click: () => void cameraManager.refresh() },
    { label: t('tray.show'), click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        markQuitting()
        app.quit()
      },
    },
  )

  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.setToolTip(
    cameras.length === 0 ? `openemeet — ${t('tray.noCameras')}` : `openemeet — ${cameras.length} × PIXY`,
  )
}

export function createTray(): void {
  if (tray) return

  try {
    tray = new Tray(trayIcon())
  } catch (err) {
    // No StatusNotifierItem host (common on bare GNOME Wayland); the app still runs.
    log.warn('Tray unavailable:', err instanceof Error ? err.message : err)
    return
  }

  setTrayLive(true)
  tray.on('click', () => showMainWindow())
  refreshTrayMenu()
  cameraManager.on('changed', () => refreshTrayMenu())
}

/** True only when a StatusNotifierItem host actually accepted our icon. */
export function hasTray(): boolean {
  return isTrayLive()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
  setTrayLive(false)
}
