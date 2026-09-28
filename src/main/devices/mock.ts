import type { AudioState, Camera, V4l2Control } from '../../shared/types.js'
import { PIXY_PRODUCT_ID, PIXY_VENDOR_ID } from '../../shared/types.js'
import { CameraController } from './controller.js'

/**
 * Control set mirroring a real EMEET PIXY, used when no hardware is attached
 * so the interface can be developed and demonstrated end to end.
 */
function mockControls(): V4l2Control[] {
  const int = (
    name: string,
    min: number,
    max: number,
    def: number,
    step = 1,
  ): V4l2Control => ({ name, type: 'int', min, max, step, default: def, value: def, inactive: false })

  const bool = (name: string, def: number): V4l2Control => ({
    name, type: 'bool', min: 0, max: 1, step: 1, default: def, value: def, inactive: false,
  })

  return [
    int('pan_absolute', -540000, 540000, 0, 3600),
    int('tilt_absolute', -324000, 324000, 0, 3600),
    int('zoom_absolute', 100, 150, 100),
    int('brightness', -64, 64, 0),
    int('contrast', 0, 100, 50),
    int('saturation', 0, 100, 64),
    int('hue', -180, 180, 0),
    int('gamma', 100, 500, 300),
    int('gain', 0, 100, 0),
    int('sharpness', 0, 100, 50),
    int('backlight_compensation', 0, 1, 0),
    bool('white_balance_automatic', 1),
    int('white_balance_temperature', 2800, 6500, 4600, 10),
    bool('focus_automatic_continuous', 1),
    int('focus_absolute', 0, 1023, 192),
    {
      name: 'auto_exposure', type: 'menu', min: 0, max: 3, step: 1, default: 3, value: 3,
      inactive: false,
      menu: [
        { value: 1, label: 'Manual Mode' },
        { value: 3, label: 'Aperture Priority Mode' },
      ],
    },
    int('exposure_time_absolute', 50, 10000, 166),
    {
      name: 'power_line_frequency', type: 'menu', min: 0, max: 2, step: 1, default: 2, value: 2,
      inactive: false,
      menu: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: '50 Hz' },
        { value: 2, label: '60 Hz' },
      ],
    },
  ]
}

/** Controls that the firmware greys out while their auto partner is on. */
const AUTO_GATED: Record<string, { partner: string; activeWhen: number }> = {
  white_balance_temperature: { partner: 'white_balance_automatic', activeWhen: 0 },
  focus_absolute: { partner: 'focus_automatic_continuous', activeWhen: 0 },
  exposure_time_absolute: { partner: 'auto_exposure', activeWhen: 1 },
}

export class MockCameraController extends CameraController {
  private readonly controls = new Map<string, V4l2Control>()

  constructor(camera: Camera) {
    super(camera, {
      tracking: 'idle', gesture: 'off', audio: 'nc', autoPrivacySeconds: null, activePresetId: null,
    })
    for (const control of mockControls()) this.controls.set(control.name, { ...control })
  }

  private refreshInactiveFlags(): void {
    for (const [name, gate] of Object.entries(AUTO_GATED)) {
      const control = this.controls.get(name)
      const partner = this.controls.get(gate.partner)
      if (control && partner) control.inactive = partner.value !== gate.activeWhen
    }
  }

  override async listControls(): Promise<V4l2Control[]> {
    this.refreshInactiveFlags()
    return [...this.controls.values()].map((c) => ({ ...c }))
  }

  override async getControl(name: string, fallback?: number): Promise<number> {
    const control = this.controls.get(name)
    if (!control) {
      if (fallback !== undefined) return fallback
      throw new Error(`Unknown control: ${name}`)
    }
    return control.value
  }

  override async setControl(name: string, value: number): Promise<void> {
    const control = this.controls.get(name)
    if (!control) throw new Error(`Unknown control: ${name}`)

    // Mirror the real driver: writing a manual value drops its auto partner.
    const gate = AUTO_GATED[name]
    if (gate) {
      const partner = this.controls.get(gate.partner)
      if (partner) partner.value = gate.activeWhen
    }

    control.value = Math.max(control.min, Math.min(control.max, Math.round(value)))
    this.refreshInactiveFlags()
  }

  protected override async writePtz(values: Record<string, number>): Promise<void> {
    for (const [name, value] of Object.entries(values)) await this.setControl(name, value)
  }

  protected override requireHid(): string {
    return 'mock://hid'
  }

  protected override async writeAndCommit(): Promise<void> {
    // No hardware round-trip; state is tracked by the calling method.
  }

  override async queryAudio(): Promise<AudioState> {
    return this.getState().audio
  }

  override async setAudio(mode: Exclude<AudioState, 'unknown'>) {
    this.restoreState({ audio: mode })
    return this.getState()
  }
}

export function createMockCamera(index: number): Camera {
  const serial = `MOCK${String(index + 1).padStart(4, '0')}`
  return {
    id: `${PIXY_VENDOR_ID.toString(16)}:${PIXY_PRODUCT_ID.toString(16)}:${serial}`,
    label: index === 0 ? 'EMEET PIXY (Demo)' : `EMEET PIXY (Demo ${index + 1})`,
    serial,
    usbPath: `mock-${index}`,
    videoDevice: `/dev/video-mock${index}`,
    hidrawDevice: `/dev/hidraw-mock${index}`,
    v4l2Name: 'EMEET PIXY: EMEET PIXY',
    isPixy: true,
    mock: true,
    capabilities: { hid: true, ptz: true, hidPermissionDenied: false },
    state: { tracking: 'idle', gesture: 'off', audio: 'nc', autoPrivacySeconds: null, activePresetId: null },
  }
}
