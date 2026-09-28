/** Shared contracts between main, preload and renderer. */

export const PIXY_VENDOR_ID = 0x328f
export const PIXY_PRODUCT_ID = 0x00c0

/** Tracking / privacy state reported by the PIXY HID channel. */
export type TrackingState = 'idle' | 'track' | 'privacy' | 'unknown'
export type GestureState = 'on' | 'off' | 'unknown'
/** nc = noise cancelling, live = live mode, org = original/raw. */
export type AudioState = 'nc' | 'live' | 'org' | 'unknown'

export interface CameraCapabilities {
  /** Proprietary HID channel present and accessible (tracking, gestures, audio). */
  hid: boolean
  /** UVC PTZ controls present. */
  ptz: boolean
  /** hidraw node exists but is not readable/writable by this user. */
  hidPermissionDenied: boolean
}

/** A v4l2 control as discovered from `v4l2-ctl --list-ctrls-menus`. */
export interface V4l2Control {
  name: string
  type: 'int' | 'bool' | 'menu' | 'button' | 'int64' | 'unknown'
  min: number
  max: number
  step: number
  default: number
  value: number
  /** Control is inactive because an "auto" counterpart owns it. */
  inactive: boolean
  menu?: { value: number; label: string }[]
}

export interface CameraState {
  tracking: TrackingState
  gesture: GestureState
  audio: AudioState
  autoPrivacySeconds: number | null
}

export interface Camera {
  /** Stable identity: USB port path + serial. Survives re-enumeration. */
  id: string
  label: string
  serial: string | null
  /** USB topology path, e.g. "3-1.2" — used to pair video + hidraw nodes. */
  usbPath: string
  videoDevice: string
  hidrawDevice: string | null
  /** Matches MediaDeviceInfo.deviceId groups so the renderer can preview it. */
  v4l2Name: string
  isPixy: boolean
  mock: boolean
  capabilities: CameraCapabilities
  state: CameraState
}

export interface Preset {
  id: string
  name: string
  pan: number
  tilt: number
  zoom: number
  createdAt: number
}

export interface SystemDiagnostics {
  v4l2CtlInstalled: boolean
  udevRuleInstalled: boolean
  userInVideoGroup: boolean
  /** GNOME needs an AppIndicator extension for a tray icon on Wayland. */
  trayAvailable: boolean
  gnomeAppIndicatorExtension: 'enabled' | 'disabled' | 'missing' | 'not-gnome'
  desktop: string
  sessionType: string
}

export interface AppSettings {
  locale: 'pt-BR' | 'en'
  theme: 'dark' | 'light' | 'system'
  startMinimized: boolean
  closeToTray: boolean
  jogStepDegrees: number
  lastCameraId: string | null
  mockDevices: boolean
}

/** Result envelope so the renderer never has to catch IPC rejections. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
