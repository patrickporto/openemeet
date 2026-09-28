import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { Camera, TrackingState } from '../shared/types.js'
import { translator } from '../shared/i18n.js'
import { IPC } from '../shared/ipc.js'
import { cameraManager } from './devices/manager.js'
import { listPresets } from './store/presets.js'
import { settings } from './store/settings.js'
import { broadcast } from './ipc.js'
import { isTrayLive, setTrayLive } from './tray-state.js'
import { markQuitting, showMainWindow } from './window.js'
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

type T = ReturnType<typeof translator>

/** One-line status used in the header row and the tooltip. */
function statusLine(camera: Camera, t: T): string {
  if (!camera.capabilities.hid) return t('status.noHid')
  switch (camera.state.tracking) {
    case 'privacy':
      return t('status.privacy')
    case 'track':
      return t('status.tracking')
    case 'idle':
      return t('status.idle')
    default:
      return t('status.online')
  }
}

/**
 * Builds a camera's actions.
 *
 * Modes are radio items because they are mutually exclusive on the device --
 * separate checkboxes could display an impossible combination.
 */
function cameraSubmenu(camera: Camera, nested: boolean): MenuItemConstructorOptions[] {
  const t = translator(settings().get('locale'))
  const id = camera.id
  const items: MenuItemConstructorOptions[] = []

  if (camera.capabilities.hid) {
    const mode = (value: Exclude<TrackingState, 'unknown'>, label: string): MenuItemConstructorOptions => ({
      label,
      type: 'radio',
      checked: camera.state.tracking === value,
      click: () => void act(`mode:${value}`, () => cameraManager.get(id).setTracking(value)),
    })

    items.push(
      { label: t('smart.mode'), enabled: false },
      mode('idle', t('smart.mode.idle')),
      mode('track', t('smart.mode.track')),
      mode('privacy', t('smart.mode.privacy')),
      { type: 'separator' },
    )
  }

  if (camera.capabilities.ptz) {
    const presets = listPresets(id)
    items.push({ label: t('tray.presets'), enabled: false })

    if (presets.length === 0) {
      items.push({ label: t('tray.noPresets'), enabled: false })
    } else {
      for (const preset of presets) {
        items.push({
          label: preset.name,
          type: 'radio',
          checked: camera.state.activePresetId === preset.id,
          click: () => void act('preset', () => cameraManager.get(id).applyPreset(preset)),
        })
      }
      // Shows the radio group as "none selected" once the framing is hand-moved.
      items.push({
        label: t('tray.custom'),
        type: 'radio',
        checked: camera.state.activePresetId === null,
        enabled: false,
      })
    }

    items.push(
      { type: 'separator' },
      {
        label: t('tray.center'),
        click: () => void act('center', () => cameraManager.get(id).center()),
      },
    )
  }

  if (camera.capabilities.hid) {
    items.push(
      {
        label: t('tray.audio'),
        submenu: (['nc', 'live', 'org'] as const).map((value) => ({
          label: t(`smart.audio.${value}` as const),
          type: 'radio' as const,
          checked: camera.state.audio === value,
          click: () => void act('audio', () => cameraManager.get(id).setAudio(value)),
        })),
      },
      {
        label: t('tray.gesture'),
        type: 'checkbox',
        checked: camera.state.gesture === 'on',
        click: () =>
          void act('gesture', () => cameraManager.get(id).setGesture(camera.state.gesture !== 'on')),
      },
    )
  }

  // With one camera the submenu is flattened into the root, which already has
  // its own "open" entry -- only nested submenus need their own.
  if (nested) {
    items.push(
      { type: 'separator' },
      { label: t('tray.show'), click: () => showMainWindow({ cameraId: id }) },
    )
  }

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
    // A single camera needs no nesting -- put its actions at the top level.
    const camera = cameras[0]
    template.push(
      { label: `${camera.label} · ${statusLine(camera, t)}`, enabled: false },
      { type: 'separator' },
      ...cameraSubmenu(camera, false),
    )
  } else {
    for (const camera of cameras) {
      template.push({
        label: `${camera.label} · ${statusLine(camera, t)}`,
        submenu: cameraSubmenu(camera, true),
      })
    }
  }

  template.push(
    { type: 'separator' },
    { label: t('tray.show'), click: () => showMainWindow() },
    { label: t('tray.refresh'), click: () => void cameraManager.refresh() },
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

  const tooltip =
    cameras.length === 0
      ? `openemeet — ${t('tray.noCameras')}`
      : cameras.length === 1
        ? `${cameras[0].label} — ${statusLine(cameras[0], t)}`
        : `openemeet — ${cameras.length} × PIXY`
  tray.setToolTip(tooltip)
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
