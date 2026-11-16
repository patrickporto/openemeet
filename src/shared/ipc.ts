import type {
  AppSettings,
  Camera,
  CameraState,
  CustomBackground,
  Preset,
  SystemDiagnostics,
  V4l2Control,
  VirtualCameraJob,
  VirtualCameraSettings,
  VirtualCameraStatus,
} from './types.js'

export interface PtzPosition {
  pan: number
  tilt: number
  zoom: number
}

export interface UdevHelp {
  command: string
  rulePath: string
}

export interface BackgroundFile {
  data: Uint8Array
  mime: string
}

/** Surface exposed to the hidden background worker as `window.vcamHost`. */
export interface VcamHostApi {
  onJob(handler: (job: VirtualCameraJob) => void): () => void
  /** Asks main to resend the current job (on worker boot). */
  ready(): void
  report(status: Partial<Pick<VirtualCameraStatus, 'state' | 'error' | 'fps'>>): void
  readBackground(id: string): Promise<BackgroundFile>
  sink: {
    /** Starts ffmpeg writing to the loopback device. */
    open(device: string, width: number, height: number, fps: number): void
    /** Queues one RGBA frame. Returns false while ffmpeg is backed up. */
    write(frame: Uint8Array): boolean
    close(): void
  }
}

/** The surface exposed to the renderer as `window.openemeet`. */
export interface OpenemeetApi {
  cameras: {
    list(): Promise<Camera[]>
    refresh(): Promise<Camera[]>
    onChanged(handler: (cameras: Camera[]) => void): () => void
  }
  controls: {
    list(cameraId: string, force?: boolean): Promise<V4l2Control[]>
    set(cameraId: string, name: string, value: number): Promise<void>
    reset(cameraId: string, name: string): Promise<void>
  }
  ptz: {
    get(cameraId: string): Promise<PtzPosition>
    set(cameraId: string, position: Partial<PtzPosition>): Promise<PtzPosition>
    nudge(cameraId: string, axis: 'pan' | 'tilt', degrees: number): Promise<PtzPosition>
    zoomBy(cameraId: string, delta: number): Promise<PtzPosition>
    center(cameraId: string): Promise<PtzPosition>
  }
  smart: {
    setTracking(cameraId: string, mode: 'idle' | 'track' | 'privacy'): Promise<CameraState>
    togglePrivacy(cameraId: string): Promise<CameraState>
    setGesture(cameraId: string, enabled: boolean): Promise<CameraState>
    setAudio(cameraId: string, mode: 'nc' | 'live' | 'org'): Promise<CameraState>
    setAutoPrivacy(cameraId: string, seconds: number): Promise<CameraState>
    setFlicker(cameraId: string, mode: 'off' | '50' | '60'): Promise<void>
    sync(cameraId: string): Promise<CameraState>
  }
  presets: {
    list(cameraId: string): Promise<Preset[]>
    save(cameraId: string, name: string): Promise<Preset>
    rename(cameraId: string, presetId: string, name: string): Promise<Preset>
    overwrite(cameraId: string, presetId: string): Promise<Preset>
    remove(cameraId: string, presetId: string): Promise<void>
    apply(cameraId: string, presetId: string): Promise<PtzPosition>
  }
  settings: {
    get(): Promise<AppSettings>
    patch(values: Partial<AppSettings>): Promise<AppSettings>
    onChanged(handler: (settings: AppSettings) => void): () => void
  }
  vcam: {
    status(): Promise<VirtualCameraStatus>
    configure(values: Partial<VirtualCameraSettings>): Promise<VirtualCameraSettings>
    onStatus(handler: (status: VirtualCameraStatus) => void): () => void
    setupCommand(): Promise<string>
    listBackgrounds(): Promise<CustomBackground[]>
    /** Opens a file picker; null when the user cancels. */
    addBackground(): Promise<CustomBackground | null>
    removeBackground(id: string): Promise<void>
    readBackground(id: string): Promise<BackgroundFile>
  }
  system: {
    diagnostics(): Promise<SystemDiagnostics>
    udevHelp(): Promise<UdevHelp>
    copyToClipboard(text: string): Promise<void>
    openExternal(url: string): Promise<void>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    onMaximizeChange(handler: (maximized: boolean) => void): () => void
  }
  /** Tray and global actions ask the UI to move; this lets the renderer follow. */
  onNavigate(handler: (payload: { cameraId?: string; tab?: string }) => void): () => void
}

export const IPC = {
  camerasList: 'cameras:list',
  camerasRefresh: 'cameras:refresh',
  camerasChanged: 'cameras:changed',

  controlsList: 'controls:list',
  controlsSet: 'controls:set',
  controlsReset: 'controls:reset',

  ptzGet: 'ptz:get',
  ptzSet: 'ptz:set',
  ptzNudge: 'ptz:nudge',
  ptzZoom: 'ptz:zoom',
  ptzCenter: 'ptz:center',

  smartTracking: 'smart:tracking',
  smartPrivacyToggle: 'smart:privacy-toggle',
  smartGesture: 'smart:gesture',
  smartAudio: 'smart:audio',
  smartAutoPrivacy: 'smart:auto-privacy',
  smartFlicker: 'smart:flicker',
  smartSync: 'smart:sync',

  presetsList: 'presets:list',
  presetsSave: 'presets:save',
  presetsRename: 'presets:rename',
  presetsOverwrite: 'presets:overwrite',
  presetsRemove: 'presets:remove',
  presetsApply: 'presets:apply',

  settingsGet: 'settings:get',
  settingsPatch: 'settings:patch',
  settingsChanged: 'settings:changed',

  vcamStatus: 'vcam:status',
  vcamStatusChanged: 'vcam:status-changed',
  vcamConfigure: 'vcam:configure',
  vcamSetupCommand: 'vcam:setup-command',
  vcamListBackgrounds: 'vcam:backgrounds-list',
  vcamAddBackground: 'vcam:backgrounds-add',
  vcamRemoveBackground: 'vcam:backgrounds-remove',
  vcamReadBackground: 'vcam:backgrounds-read',
  /** Main -> worker: what to render. */
  vcamJob: 'vcam:job',
  vcamWorkerReady: 'vcam:worker-ready',
  vcamWorkerReport: 'vcam:worker-report',

  systemDiagnostics: 'system:diagnostics',
  systemUdevHelp: 'system:udev-help',
  systemClipboard: 'system:clipboard',
  systemOpenExternal: 'system:open-external',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowMaximizeChange: 'window:maximize-change',

  navigate: 'app:navigate',
} as const
