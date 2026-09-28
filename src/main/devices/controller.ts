import type { AudioState, Camera, CameraState, TrackingState, V4l2Control } from '../../shared/types.js'
import {
  ARCSEC_PER_DEGREE,
  AUDIO_MODE,
  FLICKER_MODE,
  GESTURE_MODE,
  HID,
  HID_COMMIT_DELAY_MS,
  PTZ_LIMITS,
  TRACKING_MODE,
} from '../../shared/protocol.js'
import { HidError, queryReport, sendReport } from './hid.js'
import * as v4l2 from './v4l2.js'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)))

export interface PtzPosition {
  /** Degrees. */
  pan: number
  /** Degrees. */
  tilt: number
  /** 100-150. */
  zoom: number
}

export class CameraController {
  readonly camera: Camera
  protected state: CameraState
  private controlCache: V4l2Control[] | null = null

  constructor(camera: Camera, restoredState?: Partial<CameraState>) {
    this.camera = camera
    this.state = {
      tracking: 'unknown',
      gesture: 'unknown',
      audio: 'unknown',
      autoPrivacySeconds: null,
      ...restoredState,
    }
  }

  getState(): CameraState {
    return { ...this.state }
  }

  // --- V4L2 ---------------------------------------------------------------

  async listControls(force = false): Promise<V4l2Control[]> {
    if (!force && this.controlCache) return this.controlCache
    this.controlCache = await v4l2.listControls(this.camera.videoDevice)
    return this.controlCache
  }

  /** Invalidates the cached control list; call after writes that flip auto modes. */
  protected invalidateControls(): void {
    this.controlCache = null
  }

  async setControl(name: string, value: number): Promise<void> {
    await v4l2.prepareManualControl(this.camera.videoDevice, name)
    await v4l2.setControl(this.camera.videoDevice, name, value)
    this.invalidateControls()
  }

  async getControl(name: string, fallback?: number): Promise<number> {
    try {
      return await v4l2.getControl(this.camera.videoDevice, name)
    } catch (err) {
      if (fallback !== undefined) return fallback
      throw err
    }
  }

  async resetControl(name: string): Promise<void> {
    const control = (await this.listControls()).find((c) => c.name === name)
    if (!control) throw new Error(`Unknown control: ${name}`)
    await this.setControl(name, control.default)
  }

  // --- PTZ ----------------------------------------------------------------

  async getPtz(): Promise<PtzPosition> {
    const [pan, tilt, zoom] = await Promise.all([
      this.getControl('pan_absolute', 0),
      this.getControl('tilt_absolute', 0),
      this.getControl('zoom_absolute', PTZ_LIMITS.zoom_absolute.min),
    ])
    return {
      pan: Math.round(pan / ARCSEC_PER_DEGREE),
      tilt: Math.round(tilt / ARCSEC_PER_DEGREE),
      zoom,
    }
  }

  async setPtz(position: Partial<PtzPosition>): Promise<void> {
    const values: Record<string, number> = {}

    if (position.pan !== undefined) {
      values.pan_absolute = clamp(
        position.pan * ARCSEC_PER_DEGREE,
        PTZ_LIMITS.pan_absolute.min,
        PTZ_LIMITS.pan_absolute.max,
      )
    }
    if (position.tilt !== undefined) {
      values.tilt_absolute = clamp(
        position.tilt * ARCSEC_PER_DEGREE,
        PTZ_LIMITS.tilt_absolute.min,
        PTZ_LIMITS.tilt_absolute.max,
      )
    }
    if (position.zoom !== undefined) {
      values.zoom_absolute = clamp(
        position.zoom,
        PTZ_LIMITS.zoom_absolute.min,
        PTZ_LIMITS.zoom_absolute.max,
      )
    }

    await this.writePtz(values)
  }

  protected async writePtz(values: Record<string, number>): Promise<void> {
    if (Object.keys(values).length === 0) return
    await v4l2.setControls(this.camera.videoDevice, values)
    this.invalidateControls()
  }

  async nudge(axis: 'pan' | 'tilt', degrees: number): Promise<PtzPosition> {
    const current = await this.getPtz()
    const next = { ...current, [axis]: current[axis] + degrees }
    await this.setPtz({ [axis]: next[axis] })
    return this.getPtz()
  }

  async zoomBy(delta: number): Promise<PtzPosition> {
    const current = await this.getPtz()
    await this.setPtz({ zoom: current.zoom + delta })
    return this.getPtz()
  }

  async center(): Promise<PtzPosition> {
    await this.setPtz({ pan: 0, tilt: 0, zoom: PTZ_LIMITS.zoom_absolute.min })
    return this.getPtz()
  }

  // --- HID ----------------------------------------------------------------

  protected requireHid(): string {
    const path = this.camera.hidrawDevice
    if (!path) throw new HidError('This camera has no PIXY HID control channel')
    if (this.camera.capabilities.hidPermissionDenied) {
      throw new HidError(
        `No permission to access ${path}. Install the udev rule and replug the camera.`,
      )
    }
    return path
  }

  /** Writes a setting report, then the commit report the firmware expects. */
  protected async writeAndCommit(setBytes: number[], commitBytes: number[]): Promise<void> {
    const path = this.requireHid()
    sendReport(path, setBytes)
    await sleep(HID_COMMIT_DELAY_MS)
    sendReport(path, commitBytes)
  }

  async setTracking(mode: TrackingState): Promise<CameraState> {
    if (mode === 'unknown') throw new Error('Invalid tracking mode')
    await this.writeAndCommit(HID.setTracking(TRACKING_MODE[mode]), HID.commitTracking())
    this.state.tracking = mode
    return this.getState()
  }

  async togglePrivacy(): Promise<CameraState> {
    return this.setTracking(this.state.tracking === 'privacy' ? 'idle' : 'privacy')
  }

  async setGesture(enabled: boolean): Promise<CameraState> {
    const mode = enabled ? GESTURE_MODE.on : GESTURE_MODE.off
    await this.writeAndCommit(HID.setGesture(mode), HID.commitGesture())
    this.state.gesture = enabled ? 'on' : 'off'
    return this.getState()
  }

  async setAudio(mode: Exclude<AudioState, 'unknown'>): Promise<CameraState> {
    const path = this.requireHid()
    sendReport(path, HID.setAudio(AUDIO_MODE[mode]))
    await sleep(HID_COMMIT_DELAY_MS)
    this.state.audio = mode

    // The camera can report audio mode back, so prefer its answer over our guess.
    try {
      await this.queryAudio()
    } catch {
      // Keep the optimistic value if the query channel is unavailable.
    }
    return this.getState()
  }

  async queryAudio(): Promise<AudioState> {
    const path = this.requireHid()
    const response = await queryReport(path, HID.queryAudio())

    if (response.length <= HID.AUDIO_RESPONSE_OFFSET) {
      throw new HidError('Audio query returned a short response')
    }

    const byte = response[HID.AUDIO_RESPONSE_OFFSET]
    const mode = (Object.keys(AUDIO_MODE) as Exclude<AudioState, 'unknown'>[]).find(
      (key) => AUDIO_MODE[key] === byte,
    )
    if (!mode) throw new HidError(`Audio query returned unknown mode byte: 0x${byte.toString(16)}`)

    this.state.audio = mode
    return mode
  }

  /** 0 disables auto-privacy; otherwise 1-255 seconds of inactivity. */
  async setAutoPrivacy(seconds: number): Promise<CameraState> {
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 255) {
      throw new Error('Auto-privacy timeout must be between 0 and 255 seconds')
    }
    await this.writeAndCommit(HID.setAutoPrivacy(seconds), HID.commitAutoPrivacy())
    this.state.autoPrivacySeconds = seconds === 0 ? null : seconds
    return this.getState()
  }

  async setFlicker(mode: keyof typeof FLICKER_MODE): Promise<void> {
    await this.setControl('power_line_frequency', FLICKER_MODE[mode])
  }

  /** Refreshes whatever the camera can actually report back. */
  async sync(): Promise<CameraState> {
    if (this.camera.capabilities.hid) {
      try {
        await this.queryAudio()
      } catch {
        // Audio is the only readable HID state; the rest stays cached.
      }
    }
    return this.getState()
  }

  restoreState(state: Partial<CameraState>): void {
    this.state = { ...this.state, ...state }
  }
}
