import { BrowserWindow, ipcMain } from 'electron'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc.js'
import type {
  Camera,
  VirtualCameraJob,
  VirtualCameraSettings,
  VirtualCameraStatus,
} from '../../shared/types.js'
import { cameraManager } from '../devices/manager.js'
import { settings } from '../store/settings.js'
import { log } from '../logger.js'
import { findLoopbackDevice, isFfmpegInstalled, type LoopbackDevice } from './loopback.js'

type WorkerReport = Partial<Pick<VirtualCameraStatus, 'state' | 'error' | 'fps'>>

/** While waiting for the user to load v4l2loopback, look again this often. */
const LOOPBACK_POLL_MS = 4000
const RESTART_DELAY_MS = 2000

/**
 * Owns the virtual camera: decides what should be published and drives a
 * hidden worker window that captures, segments and composites the video.
 *
 * The worker exists only while the feature is enabled, so turning it off
 * releases the physical camera and the GPU completely.
 */
class VirtualCameraService extends EventEmitter<{ status: [VirtualCameraStatus] }> {
  private worker: BrowserWindow | null = null
  private loopback: LoopbackDevice | null = null
  private ffmpeg = true
  private report: WorkerReport = {}
  private poll: NodeJS.Timeout | null = null
  private restart: NodeJS.Timeout | null = null
  private lastStatus = ''
  private stopping = false

  init(): void {
    ipcMain.on(IPC.vcamWorkerReady, (event) => {
      if (event.sender === this.worker?.webContents) this.pushJob()
    })
    ipcMain.on(IPC.vcamWorkerReport, (event, report: WorkerReport) => {
      if (event.sender !== this.worker?.webContents) return
      this.report = { ...this.report, ...report }
      this.publish()
    })

    // Hotplug and privacy changes alter what the worker may capture.
    cameraManager.on('changed', () => this.pushJob())
    void this.reconcile()
  }

  get config(): VirtualCameraSettings {
    return settings().get('virtualCamera')
  }

  async configure(values: Partial<VirtualCameraSettings>): Promise<VirtualCameraSettings> {
    const next = { ...this.config, ...values }
    settings().set('virtualCamera', next)
    await this.reconcile()
    return next
  }

  /** Re-reads the system and starts or stops the worker to match settings. */
  async reconcile(): Promise<void> {
    const [loopback, ffmpeg] = await Promise.all([findLoopbackDevice(), isFfmpegInstalled()])
    this.loopback = loopback
    this.ffmpeg = ffmpeg

    if (this.config.enabled) this.ensureWorker()
    else this.destroyWorker()

    // Pick up a freshly loaded module without asking the user to restart.
    const waiting = this.config.enabled && !loopback
    if (waiting && !this.poll) {
      this.poll = setInterval(() => void this.reconcile(), LOOPBACK_POLL_MS)
    } else if (!waiting && this.poll) {
      clearInterval(this.poll)
      this.poll = null
    }

    this.pushJob()
  }

  private sourceCamera(): Camera | null {
    const cameras = cameraManager.list()
    const wanted = this.config.sourceCameraId
    return (
      cameras.find((camera) => camera.id === wanted) ??
      (wanted ? null : (cameras.find((camera) => !camera.mock) ?? cameras[0] ?? null))
    )
  }

  private issue(source: Camera | null): VirtualCameraStatus['issue'] {
    if (!this.ffmpeg) return 'no-ffmpeg'
    if (!this.loopback) return 'no-loopback'
    if (!source) return 'no-source'
    if (source.mock) return 'mock-source'
    return null
  }

  private job(): VirtualCameraJob {
    const config = this.config
    const source = this.sourceCamera()
    const run = config.enabled && this.issue(source) === null

    return {
      run,
      device: this.loopback?.device ?? null,
      deviceLabel: this.loopback?.label ?? null,
      source: source && run ? { cameraId: source.id, v4l2Name: source.v4l2Name, label: source.label } : null,
      blocked: source?.state.tracking === 'privacy',
      effect: config.effect,
      blur: config.blur,
      image: config.image,
      color: config.color,
      locale: settings().get('locale'),
    }
  }

  /** Sends the worker what to render, and republishes the status. */
  pushJob(): void {
    const worker = this.worker
    if (worker && !worker.isDestroyed() && !worker.webContents.isLoading()) {
      worker.webContents.send(IPC.vcamJob, this.job())
    }
    this.publish()
  }

  status(): VirtualCameraStatus {
    const config = this.config
    const source = this.sourceCamera()
    const issue = config.enabled ? this.issue(source) : null

    let state: VirtualCameraStatus['state'] = 'off'
    if (config.enabled) state = issue ? 'error' : (this.report.state ?? 'starting')

    return {
      state,
      device: this.loopback?.device ?? null,
      deviceLabel: this.loopback?.label ?? null,
      sourceCameraId: source?.id ?? null,
      issue,
      error: issue ? null : (this.report.error ?? null),
      fps: state === 'running' ? (this.report.fps ?? 0) : 0,
    }
  }

  private publish(): void {
    const status = this.status()
    // fps ticks every second; only real changes are worth a broadcast.
    const key = JSON.stringify(status)
    if (key === this.lastStatus) return
    this.lastStatus = key
    this.emit('status', status)
  }

  private ensureWorker(): void {
    if (this.worker && !this.worker.isDestroyed()) return
    if (this.restart) {
      clearTimeout(this.restart)
      this.restart = null
    }

    this.report = { state: 'starting' }
    const worker = new BrowserWindow({
      show: false,
      width: 320,
      height: 180,
      webPreferences: {
        preload: join(__dirname, '../preload/vcam.mjs'),
        // The preload spawns ffmpeg so frames never cross the IPC boundary.
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        // A hidden window is throttled by default, which would starve the encoder.
        backgroundThrottling: false,
      },
    })
    this.worker = worker

    worker.webContents.on('render-process-gone', (_event, details) => {
      log.warn('Virtual camera worker died:', details.reason)
      this.report = { state: 'error', error: `worker ${details.reason}` }
      this.worker = null
      if (!worker.isDestroyed()) worker.destroy()
      this.publish()
      // Recover from GPU or OOM crashes without user action.
      this.restart = setTimeout(() => {
        this.restart = null
        if (this.config.enabled) this.ensureWorker()
      }, RESTART_DELAY_MS)
    })
    worker.on('closed', () => {
      if (this.worker === worker) this.worker = null
    })

    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer) void worker.loadURL(`${devServer}/vcam.html`)
    else void worker.loadFile(join(__dirname, '../renderer/vcam.html'))
  }

  private destroyWorker(): void {
    if (this.restart) {
      clearTimeout(this.restart)
      this.restart = null
    }
    const worker = this.worker
    this.worker = null
    this.report = {}
    if (worker && !worker.isDestroyed()) worker.destroy()
  }

  stop(): void {
    if (this.stopping) return
    this.stopping = true
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    this.destroyWorker()
  }
}

export const virtualCamera = new VirtualCameraService()
