import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type OpenemeetApi } from '../shared/ipc.js'

/** Subscribes to a main->renderer event and returns an unsubscribe function. */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OpenemeetApi = {
  cameras: {
    list: () => ipcRenderer.invoke(IPC.camerasList),
    refresh: () => ipcRenderer.invoke(IPC.camerasRefresh),
    onChanged: (handler) => subscribe(IPC.camerasChanged, handler),
  },
  controls: {
    list: (cameraId, force = false) => ipcRenderer.invoke(IPC.controlsList, cameraId, force),
    set: (cameraId, name, value) => ipcRenderer.invoke(IPC.controlsSet, cameraId, name, value),
    reset: (cameraId, name) => ipcRenderer.invoke(IPC.controlsReset, cameraId, name),
  },
  ptz: {
    get: (cameraId) => ipcRenderer.invoke(IPC.ptzGet, cameraId),
    set: (cameraId, position) => ipcRenderer.invoke(IPC.ptzSet, cameraId, position),
    nudge: (cameraId, axis, degrees) => ipcRenderer.invoke(IPC.ptzNudge, cameraId, axis, degrees),
    zoomBy: (cameraId, delta) => ipcRenderer.invoke(IPC.ptzZoom, cameraId, delta),
    center: (cameraId) => ipcRenderer.invoke(IPC.ptzCenter, cameraId),
  },
  smart: {
    setTracking: (cameraId, mode) => ipcRenderer.invoke(IPC.smartTracking, cameraId, mode),
    togglePrivacy: (cameraId) => ipcRenderer.invoke(IPC.smartPrivacyToggle, cameraId),
    setGesture: (cameraId, enabled) => ipcRenderer.invoke(IPC.smartGesture, cameraId, enabled),
    setAudio: (cameraId, mode) => ipcRenderer.invoke(IPC.smartAudio, cameraId, mode),
    setAutoPrivacy: (cameraId, seconds) => ipcRenderer.invoke(IPC.smartAutoPrivacy, cameraId, seconds),
    setFlicker: (cameraId, mode) => ipcRenderer.invoke(IPC.smartFlicker, cameraId, mode),
    sync: (cameraId) => ipcRenderer.invoke(IPC.smartSync, cameraId),
  },
  presets: {
    list: (cameraId) => ipcRenderer.invoke(IPC.presetsList, cameraId),
    save: (cameraId, name) => ipcRenderer.invoke(IPC.presetsSave, cameraId, name),
    rename: (cameraId, presetId, name) => ipcRenderer.invoke(IPC.presetsRename, cameraId, presetId, name),
    overwrite: (cameraId, presetId) => ipcRenderer.invoke(IPC.presetsOverwrite, cameraId, presetId),
    remove: (cameraId, presetId) => ipcRenderer.invoke(IPC.presetsRemove, cameraId, presetId),
    apply: (cameraId, presetId) => ipcRenderer.invoke(IPC.presetsApply, cameraId, presetId),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    patch: (values) => ipcRenderer.invoke(IPC.settingsPatch, values),
    onChanged: (handler) => subscribe(IPC.settingsChanged, handler),
  },
  system: {
    diagnostics: () => ipcRenderer.invoke(IPC.systemDiagnostics),
    udevHelp: () => ipcRenderer.invoke(IPC.systemUdevHelp),
    copyToClipboard: (text) => ipcRenderer.invoke(IPC.systemClipboard, text),
    openExternal: (url) => ipcRenderer.invoke(IPC.systemOpenExternal, url),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    onMaximizeChange: (handler) => subscribe(IPC.windowMaximizeChange, handler),
  },
  onNavigate: (handler) => subscribe(IPC.navigate, handler),
}

contextBridge.exposeInMainWorld('openemeet', api)
