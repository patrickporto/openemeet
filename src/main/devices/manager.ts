import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Camera } from '../../shared/types.js'
import { CameraController } from './controller.js'
import { MockCameraController, createMockCamera } from './mock.js'
import { scanCameras } from './scanner.js'
import { cacheState, getCachedState } from '../store/presets.js'
import { settings } from '../store/settings.js'
import { log } from '../logger.js'

const HOTPLUG_DEBOUNCE_MS = 400
const POLL_INTERVAL_MS = 4000

const UDEV_ARGS = ['monitor', '--udev', '--subsystem-match=usb', '--subsystem-match=video4linux']

/**
 * Builds the udev monitor command.
 *
 * Electron traps termination signals natively, so a JS `exit` handler cannot be
 * relied on to reap the child, and a SIGKILL leaves it orphaned holding any
 * descriptor it inherited. `setpriv --pdeathsig` asks the kernel to signal the
 * child the moment we die, which covers every exit path. It ships with
 * util-linux; if it is missing we fall back to a plain spawn.
 */
function monitorCommand(): string[] {
  if (existsSync('/usr/bin/setpriv')) {
    return ['setpriv', '--pdeathsig', 'TERM', '--', 'udevadm', ...UDEV_ARGS]
  }
  return ['udevadm', ...UDEV_ARGS]
}

export class CameraManager extends EventEmitter {
  private controllers = new Map<string, CameraController>()
  private monitor: ChildProcess | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private debounce: NodeJS.Timeout | null = null
  private scanning = false
  private exitGuardsInstalled = false

  list(): Camera[] {
    return [...this.controllers.values()].map((c) => ({ ...c.camera, state: c.getState() }))
  }

  get(id: string): CameraController {
    const controller = this.controllers.get(id)
    if (!controller) throw new Error(`Camera not connected: ${id}`)
    return controller
  }

  has(id: string): boolean {
    return this.controllers.has(id)
  }

  async refresh(): Promise<Camera[]> {
    if (this.scanning) return this.list()
    this.scanning = true

    try {
      const config = settings().all
      const found = config.mockDevices
        ? [createMockCamera(0), createMockCamera(1)]
        : await scanCameras({ includeGenericCameras: config.includeGenericCameras })

      const seen = new Set(found.map((c) => c.id))

      for (const [id, controller] of this.controllers) {
        if (seen.has(id)) continue
        cacheState(id, controller.getState())
        this.controllers.delete(id)
        log.info(`Camera disconnected: ${id}`)
        this.emit('disconnected', id)
      }

      for (const camera of found) {
        const existing = this.controllers.get(camera.id)
        if (existing) {
          // Node paths can change across replug; keep the live object current.
          Object.assign(existing.camera, camera, { state: existing.getState() })
          continue
        }

        const controller = camera.mock
          ? new MockCameraController(camera)
          : new CameraController(camera, getCachedState(camera.id))

        this.controllers.set(camera.id, controller)
        log.info(`Camera connected: ${camera.label} (${camera.videoDevice})`)
        this.emit('connected', camera)

        // Pull whatever the camera can report, then publish the corrected state.
        void controller
          .sync()
          .then(() => this.emit('changed', this.list()))
          .catch(() => undefined)
      }

      const cameras = this.list()
      this.emit('changed', cameras)
      return cameras
    } finally {
      this.scanning = false
    }
  }

  private scheduleRefresh(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      void this.refresh().catch((err) => log.error('Refresh failed', err))
    }, HOTPLUG_DEBOUNCE_MS)
  }

  /**
   * Watches udev for USB/video events. Falls back to polling when udevadm is
   * unavailable (some sandboxes), so hotplug still works, just less promptly.
   */
  startWatching(): void {
    try {
      const [command, ...args] = monitorCommand()
      this.monitor = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })

      this.installExitGuards()

      this.monitor.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        if (text.includes('add') || text.includes('remove') || text.includes('bind')) {
          this.scheduleRefresh()
        }
      })

      this.monitor.on('error', () => this.startPolling())
      this.monitor.on('exit', () => {
        this.monitor = null
        this.startPolling()
      })
    } catch {
      this.startPolling()
    }
  }

  /**
   * Best-effort cleanup for ordinary exits. The hard guarantee comes from
   * `--pdeathsig` (see `monitorCommand`): Electron handles termination signals
   * in native code, so these JS listeners often never run.
   */
  private installExitGuards(): void {
    if (this.exitGuardsInstalled) return
    this.exitGuardsInstalled = true

    const cleanup = () => {
      this.monitor?.kill('SIGTERM')
      this.monitor = null
    }

    process.once('exit', cleanup)
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.once(signal, () => {
        cleanup()
        process.exit(0)
      })
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return
    log.info('udev monitor unavailable, polling for device changes')
    this.pollTimer = setInterval(() => this.scheduleRefresh(), POLL_INTERVAL_MS)
  }

  /** Persists HID state so it survives an app restart (the channel is write-only). */
  persistAll(): void {
    for (const [id, controller] of this.controllers) cacheState(id, controller.getState())
  }

  stop(): void {
    this.persistAll()
    if (this.debounce) clearTimeout(this.debounce)
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.monitor?.kill()
    this.monitor = null
    this.pollTimer = null
  }
}

export const cameraManager = new CameraManager()
