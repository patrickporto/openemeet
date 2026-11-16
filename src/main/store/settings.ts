import type { AppSettings } from '../../shared/types.js'
import { JsonStore } from './json-store.js'

export interface PersistedSettings extends AppSettings {
  /** Show non-PIXY UVC webcams too (V4L2 controls only). */
  includeGenericCameras: boolean
}

const DEFAULTS: PersistedSettings = {
  locale: 'pt-BR',
  theme: 'dark',
  startMinimized: false,
  launchAtLogin: false,
  closeToTray: true,
  jogStepDegrees: 10,
  lastCameraId: null,
  mockDevices: false,
  includeGenericCameras: false,
  virtualCamera: {
    enabled: false,
    sourceCameraId: null,
    effect: 'blur',
    blur: 60,
    image: 'builtin:studio',
    color: '#1f8a5b',
  },
}

let store: JsonStore<PersistedSettings> | null = null

export function settings(): JsonStore<PersistedSettings> {
  if (!store) {
    store = new JsonStore<PersistedSettings>('settings.json', {
      ...DEFAULTS,
      // Follow the system language on first run.
      locale: detectLocale(),
    })
    // The store merges shallowly; fill nested keys added in newer versions.
    const vcam = store.get('virtualCamera')
    store.set('virtualCamera', { ...DEFAULTS.virtualCamera, ...vcam })
  }
  return store
}

function detectLocale(): AppSettings['locale'] {
  const env = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').toLowerCase()
  return env.startsWith('pt') ? 'pt-BR' : 'en'
}
