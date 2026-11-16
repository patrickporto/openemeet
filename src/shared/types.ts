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
  /** Preset whose framing the camera currently holds; null once moved by hand. */
  activePresetId: string | null
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
  ffmpegInstalled: boolean
  /** A v4l2loopback device exists to publish the virtual camera on. */
  loopbackReady: boolean
}

// --- Virtual camera -----------------------------------------------------------

export type BackgroundEffect = 'none' | 'blur' | 'image' | 'color'

export interface VirtualCameraSettings {
  /** The user wants the virtual camera published. */
  enabled: boolean
  /** Physical camera feeding the virtual one; null picks the first available. */
  sourceCameraId: string | null
  effect: BackgroundEffect
  /** Blur strength, 0-100. */
  blur: number
  /** `builtin:<id>` or `custom:<file name>`. */
  image: string
  /** CSS hex colour for the solid background. */
  color: string
}

export type VirtualCameraIssue =
  /** v4l2loopback is not loaded, so there is no device to publish to. */
  | 'no-loopback'
  | 'no-ffmpeg'
  /** The source camera is unplugged or not selected. */
  | 'no-source'
  /** Demo cameras have no real stream to process. */
  | 'mock-source'

export interface VirtualCameraStatus {
  /** `paused`: publishing a placeholder because the source is in privacy mode. */
  state: 'off' | 'starting' | 'running' | 'paused' | 'error'
  /** Loopback node we publish to, e.g. /dev/video42. */
  device: string | null
  /** Name other apps list the virtual camera under. */
  deviceLabel: string | null
  sourceCameraId: string | null
  issue: VirtualCameraIssue | null
  /** Free-form error from the processing pipeline. */
  error: string | null
  fps: number
}

export interface CustomBackground {
  /** `custom:<file name>` — same format as VirtualCameraSettings.image. */
  id: string
  name: string
}

/** Everything the background worker needs to render a frame. */
export interface VirtualCameraJob {
  run: boolean
  device: string | null
  /** Our own output's label, so the worker never captures itself. */
  deviceLabel: string | null
  source: { cameraId: string; v4l2Name: string; label: string } | null
  /** Source is in privacy mode: it must not be captured at all. */
  blocked: boolean
  effect: BackgroundEffect
  blur: number
  image: string
  color: string
  locale: AppSettings['locale']
}

export interface AppSettings {
  locale: 'pt-BR' | 'en'
  theme: 'dark' | 'light' | 'system'
  startMinimized: boolean
  /** Launch with the desktop session (XDG autostart entry). */
  launchAtLogin: boolean
  closeToTray: boolean
  jogStepDegrees: number
  lastCameraId: string | null
  mockDevices: boolean
  virtualCamera: VirtualCameraSettings
}

/** Result envelope so the renderer never has to catch IPC rejections. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
