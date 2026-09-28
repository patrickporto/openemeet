import { randomUUID } from 'node:crypto'
import type { Preset } from '../../shared/types.js'
import { JsonStore } from './json-store.js'
import type { CameraState } from '../../shared/types.js'

interface PresetFile {
  /** Presets are scoped per camera id so two PIXYs do not share framing. */
  byCamera: Record<string, Preset[]>
  /** Last known HID state per camera; the channel is mostly write-only. */
  stateByCamera: Record<string, Partial<CameraState>>
}

let store: JsonStore<PresetFile> | null = null

function db(): JsonStore<PresetFile> {
  store ??= new JsonStore<PresetFile>('presets.json', { byCamera: {}, stateByCamera: {} })
  return store
}

export function listPresets(cameraId: string): Preset[] {
  return [...(db().get('byCamera')[cameraId] ?? [])].sort((a, b) => a.createdAt - b.createdAt)
}

export function savePreset(
  cameraId: string,
  name: string,
  position: { pan: number; tilt: number; zoom: number },
): Preset {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Preset name cannot be empty')

  const byCamera = { ...db().get('byCamera') }
  const existing = byCamera[cameraId] ?? []

  // Saving over an existing name overwrites it rather than duplicating.
  const previous = existing.find((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  const preset: Preset = {
    id: previous?.id ?? randomUUID(),
    name: trimmed,
    ...position,
    createdAt: previous?.createdAt ?? Date.now(),
  }

  byCamera[cameraId] = previous
    ? existing.map((p) => (p.id === preset.id ? preset : p))
    : [...existing, preset]

  db().set('byCamera', byCamera)
  return preset
}

export function updatePreset(cameraId: string, presetId: string, patch: Partial<Preset>): Preset {
  const byCamera = { ...db().get('byCamera') }
  const existing = byCamera[cameraId] ?? []
  const target = existing.find((p) => p.id === presetId)
  if (!target) throw new Error('Preset not found')

  const updated: Preset = { ...target, ...patch, id: target.id }
  byCamera[cameraId] = existing.map((p) => (p.id === presetId ? updated : p))
  db().set('byCamera', byCamera)
  return updated
}

export function deletePreset(cameraId: string, presetId: string): void {
  const byCamera = { ...db().get('byCamera') }
  byCamera[cameraId] = (byCamera[cameraId] ?? []).filter((p) => p.id !== presetId)
  db().set('byCamera', byCamera)
}

export function getCachedState(cameraId: string): Partial<CameraState> {
  return db().get('stateByCamera')[cameraId] ?? {}
}

export function cacheState(cameraId: string, state: Partial<CameraState>): void {
  const stateByCamera = { ...db().get('stateByCamera'), [cameraId]: state }
  db().set('stateByCamera', stateByCamera)
}
