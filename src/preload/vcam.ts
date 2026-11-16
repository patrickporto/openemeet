import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { IPC, type VcamHostApi } from '../shared/ipc.js'
import type { VirtualCameraJob } from '../shared/types.js'

/**
 * Preload for the hidden background worker.
 *
 * ffmpeg is spawned here rather than in main: a 720p RGBA frame is 3.6 MB,
 * and pushing 30 of those a second through IPC would saturate the main
 * process. From the preload they go straight into ffmpeg's stdin.
 */
let ffmpeg: ChildProcessByStdio<Writable, null, Readable> | null = null
let backedUp = false

function closeSink(): void {
  const child = ffmpeg
  ffmpeg = null
  backedUp = false
  if (!child) return
  child.stdin.end()
  // ffmpeg exits on EOF; make sure a wedged one does not linger.
  setTimeout(() => child.kill('SIGKILL'), 1500).unref?.()
}

const api: VcamHostApi = {
  onJob: (handler) => {
    const listener = (_event: IpcRendererEvent, job: VirtualCameraJob) => handler(job)
    ipcRenderer.on(IPC.vcamJob, listener)
    return () => ipcRenderer.removeListener(IPC.vcamJob, listener)
  },
  ready: () => ipcRenderer.send(IPC.vcamWorkerReady),
  report: (status) => ipcRenderer.send(IPC.vcamWorkerReport, status),
  readBackground: (id) => ipcRenderer.invoke(IPC.vcamReadBackground, id),
  sink: {
    open(device, width, height, fps) {
      closeSink()
      const child = spawn(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel', 'error',
          '-f', 'rawvideo',
          '-pix_fmt', 'rgba',
          '-video_size', `${width}x${height}`,
          '-framerate', String(fps),
          '-i', 'pipe:0',
          // YUV 4:2:0 is the format browsers and meeting apps accept everywhere.
          '-vf', 'format=yuv420p',
          '-f', 'v4l2',
          device,
        ],
        { stdio: ['pipe', 'ignore', 'pipe'] },
      )
      ffmpeg = child

      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-600)
      })
      child.stdin.on('error', () => undefined)
      child.stdin.on('drain', () => {
        backedUp = false
      })
      child.on('exit', (code) => {
        if (ffmpeg !== child) return
        ffmpeg = null
        const message = stderr.trim().split('\n').pop() || `ffmpeg exited (${code})`
        ipcRenderer.send(IPC.vcamWorkerReport, { state: 'error', error: message })
      })
      child.on('error', (err) => {
        if (ffmpeg !== child) return
        ffmpeg = null
        ipcRenderer.send(IPC.vcamWorkerReport, { state: 'error', error: err.message })
      })
    },
    write(frame) {
      if (!ffmpeg || backedUp) return false
      // Returns false once the pipe buffer fills; drop frames until it drains.
      backedUp = !ffmpeg.stdin.write(frame)
      return true
    },
    close: closeSink,
  },
}

// The preload has no DOM typings; the global is still the page's window.
;(globalThis as unknown as EventTarget).addEventListener('beforeunload', closeSink)

contextBridge.exposeInMainWorld('vcamHost', api)
