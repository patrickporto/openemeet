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
  closeToTray: true,
  jogStepDegrees: 10,
  lastCameraId: null,
  mockDevices: false,
  includeGenericCameras: false,
}

let store: JsonStore<PersistedSettings> | null = null

export function settings(): JsonStore<PersistedSettings> {
  store ??= new JsonStore<PersistedSettings>('settings.json', {
    ...DEFAULTS,
    // Follow the system language on first run.
    locale: detectLocale(),
  })
  return store
}

function detectLocale(): AppSettings['locale'] {
  const env = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').toLowerCase()
  return env.startsWith('pt') ? 'pt-BR' : 'en'
}
