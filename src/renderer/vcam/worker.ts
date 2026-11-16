import { ImageSegmenter } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import type { VirtualCameraJob } from '@shared/types'
import { labelledDevices, pickDeviceId } from '../lib/pickDevice'
import { BUILTIN_BACKGROUNDS, drawCover, isBuiltin, paintBuiltin } from './backgrounds'
import modelUrl from './models/selfie_segmenter_landscape.tflite?url'

/**
 * Hidden worker that produces the virtual camera feed:
 * capture -> person segmentation -> background compositing -> ffmpeg.
 *
 * Everything runs locally; no frame ever leaves the machine.
 */

const WIDTH = 1280
const HEIGHT = 720
const FPS = 30
/** Frame rate for the static privacy card; keeps consumers from timing out. */
const PLACEHOLDER_FPS = 10

const host = window.vcamHost

// --- Canvases ---------------------------------------------------------------

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  return { canvas, ctx }
}

const out = canvas2d(WIDTH, HEIGHT)
const person = canvas2d(WIDTH, HEIGHT)
const background = canvas2d(WIDTH, HEIGHT)
let backgroundKey = ''

// --- Segmentation -----------------------------------------------------------

let segmenter: Promise<ImageSegmenter> | null = null

function loadSegmenter(): Promise<ImageSegmenter> {
  const create = (delegate: 'GPU' | 'CPU') =>
    ImageSegmenter.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      },
    )
  // Some GPU/driver combinations reject the WebGL delegate; the model is
  // small enough that the CPU path still keeps up at 30 fps.
  segmenter ??= create('GPU').catch(() => create('CPU'))
  segmenter.catch(() => {
    segmenter = null
  })
  return segmenter
}

let mask: { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D; image: ImageData } | null = null
/** Exponential moving average of the confidence mask, to calm edge flicker. */
let smoothed: Float32Array | null = null
let lastTimestamp = 0

function updateMask(values: Float32Array, width: number, height: number): void {
  if (!mask || mask.canvas.width !== width || mask.canvas.height !== height) {
    const { canvas, ctx } = canvas2d(width, height)
    mask = { canvas, ctx, image: ctx.createImageData(width, height) }
    smoothed = new Float32Array(values)
  }

  const ema = smoothed!
  const pixels = mask.image.data
  for (let i = 0; i < values.length; i++) {
    const v = (ema[i] = ema[i] * 0.4 + values[i] * 0.6)
    // Smoothstep tightens the soft model output into a clean but feathered edge.
    const t = Math.min(1, Math.max(0, (v - 0.3) / 0.45))
    const o = i * 4
    pixels[o] = pixels[o + 1] = pixels[o + 2] = 255
    pixels[o + 3] = t * t * (3 - 2 * t) * 255
  }
  mask.ctx.putImageData(mask.image, 0, 0)
}

async function segment(frame: VideoFrame): Promise<boolean> {
  const model = await loadSegmenter()
  // MediaPipe requires strictly increasing timestamps.
  const timestamp = Math.max(performance.now(), lastTimestamp + 1)
  lastTimestamp = timestamp

  let ok = false
  model.segmentForVideo(frame, timestamp, (result) => {
    const masks = result.confidenceMasks
    // The selfie model emits a single "person" channel; multi-class ones put it last.
    const confidence = masks?.[masks.length - 1]
    if (!confidence) return
    updateMask(confidence.getAsFloat32Array(), confidence.width, confidence.height)
    ok = true
  })
  return ok
}

// --- Compositing ------------------------------------------------------------

/** Cover-fit rectangle for a source of the given size inside the output. */
function coverRect(width: number, height: number): [number, number, number, number] {
  const scale = Math.max(WIDTH / width, HEIGHT / height)
  const w = width * scale
  const h = height * scale
  return [(WIDTH - w) / 2, (HEIGHT - h) / 2, w, h]
}

async function prepareBackground(job: VirtualCameraJob): Promise<void> {
  if (job.effect !== 'image' || backgroundKey === job.image) return
  backgroundKey = job.image
  const { ctx } = background

  try {
    if (isBuiltin(job.image)) {
      paintBuiltin(ctx, job.image.slice(8) as (typeof BUILTIN_BACKGROUNDS)[number], WIDTH, HEIGHT)
      return
    }
    const file = await host.readBackground(job.image)
    const bitmap = await createImageBitmap(new Blob([file.data as BlobPart], { type: file.mime }))
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    drawCover(ctx, bitmap, WIDTH, HEIGHT)
    bitmap.close()
  } catch (err) {
    console.warn('Background failed to load, using the default:', err)
    paintBuiltin(ctx, 'studio', WIDTH, HEIGHT)
  }
}

function compose(job: VirtualCameraJob, frame: VideoFrame, segmented: boolean): void {
  const ctx = out.ctx
  const rect = coverRect(frame.displayWidth, frame.displayHeight)

  if (job.effect === 'none' || !segmented || !mask) {
    ctx.drawImage(frame, ...rect)
    return
  }

  if (job.effect === 'blur') {
    // Scaled to the output so the slider feels the same at any resolution.
    const radius = 2 + (job.blur / 100) * 26
    ctx.filter = `blur(${radius.toFixed(1)}px)`
    // Overscan hides the transparent fringe the blur pulls in from the edges.
    const pad = radius * 2
    ctx.drawImage(frame, rect[0] - pad, rect[1] - pad, rect[2] + pad * 2, rect[3] + pad * 2)
    ctx.filter = 'none'
  } else if (job.effect === 'image') {
    ctx.drawImage(background.canvas, 0, 0)
  } else {
    ctx.fillStyle = job.color
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  // Cut the person out with the (upscaled, feathered) mask, then lay them on top.
  const p = person.ctx
  p.globalCompositeOperation = 'copy'
  p.filter = 'blur(2px)'
  p.drawImage(mask.canvas, ...rect)
  p.filter = 'none'
  p.globalCompositeOperation = 'source-in'
  p.drawImage(frame, ...rect)
  p.globalCompositeOperation = 'source-over'
  ctx.drawImage(person.canvas, 0, 0)
}

// --- Output -----------------------------------------------------------------

let sinkDevice: string | null = null
let written = 0

function push(): void {
  const pixels = out.ctx.getImageData(0, 0, WIDTH, HEIGHT).data
  if (host.sink.write(new Uint8Array(pixels.buffer))) written++
}

setInterval(() => {
  if (capture && !job?.blocked) host.report({ fps: written })
  written = 0
}, 1000)

function paintPlaceholder(locale: VirtualCameraJob['locale']): void {
  const ctx = out.ctx
  ctx.fillStyle = '#0e0f13'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const cx = WIDTH / 2
  const cy = HEIGHT / 2 - 30
  ctx.strokeStyle = 'rgba(232, 234, 240, 0.7)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, 44, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 31, cy - 31)
  ctx.lineTo(cx + 31, cy + 31)
  ctx.stroke()

  ctx.fillStyle = 'rgba(232, 234, 240, 0.85)'
  ctx.font = '500 30px "Instrument Sans Variable", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(locale === 'pt-BR' ? 'Câmera em modo privacidade' : 'Camera in privacy mode', cx, cy + 92)
}

let placeholder: number | null = null

function startPlaceholder(job: VirtualCameraJob): void {
  paintPlaceholder(job.locale)
  if (placeholder !== null) return
  placeholder = window.setInterval(push, 1000 / PLACEHOLDER_FPS)
}

function stopPlaceholder(): void {
  if (placeholder !== null) window.clearInterval(placeholder)
  placeholder = null
}

// --- Capture ----------------------------------------------------------------

interface Capture {
  cameraId: string
  stream: MediaStream
  reader: ReadableStreamDefaultReader<VideoFrame>
}

let capture: Capture | null = null
let job: VirtualCameraJob | null = null

function stopCapture(): void {
  const current = capture
  capture = null
  if (!current) return
  void current.reader.cancel().catch(() => undefined)
  current.stream.getTracks().forEach((track) => track.stop())
}

async function startCapture(source: NonNullable<VirtualCameraJob['source']>, exclude: string[]) {
  host.report({ state: 'starting', error: null })

  const devices = await labelledDevices()
  // Never pick our own output, or the feed would loop back into itself.
  const deviceId = pickDeviceId(devices, source, { exclude })
  if (!deviceId) throw new Error(`Camera "${source.label}" not found`)

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: WIDTH },
      height: { ideal: HEIGHT },
      frameRate: { ideal: FPS },
    },
  })
  const [track] = stream.getVideoTracks()
  const reader = new MediaStreamTrackProcessor({ track }).readable.getReader()
  const current: Capture = { cameraId: source.cameraId, stream, reader }
  capture = current

  void pump(current)
}

async function pump(current: Capture): Promise<void> {
  let reported = false

  while (capture === current) {
    let result: ReadableStreamReadResult<VideoFrame>
    try {
      result = await current.reader.read()
    } catch {
      break
    }
    if (result.done) break

    const frame = result.value
    try {
      const active = job
      if (!active || capture !== current) continue

      let segmented = false
      if (active.effect !== 'none') {
        try {
          segmented = await segment(frame)
        } catch (err) {
          host.report({ error: `segmentation: ${err instanceof Error ? err.message : err}` })
        }
      }
      if (capture !== current) continue

      compose(active, frame, segmented)
      push()

      if (!reported) {
        reported = true
        host.report({ state: 'running', error: null })
      }
    } finally {
      frame.close()
    }
  }

  // The stream ended on its own (unplugged, or taken by privacy mode).
  if (capture === current) {
    capture = null
    current.stream.getTracks().forEach((track) => track.stop())
    host.report({ state: 'error', error: 'Camera stream ended' })
  }
}

// --- Job reconciliation -----------------------------------------------------

async function apply(next: VirtualCameraJob): Promise<void> {
  job = next

  if (!next.run || !next.device) {
    stopCapture()
    stopPlaceholder()
    host.sink.close()
    sinkDevice = null
    host.report({ state: 'starting', error: null, fps: 0 })
    return
  }

  if (sinkDevice !== next.device) {
    host.sink.open(next.device, WIDTH, HEIGHT, FPS)
    sinkDevice = next.device
  }

  await prepareBackground(next)
  // Warm the model up front so enabling an effect is instant.
  if (next.effect !== 'none') void loadSegmenter().catch(() => undefined)

  if (next.blocked || !next.source) {
    // Privacy mode: release the camera entirely, keep the device alive.
    stopCapture()
    startPlaceholder(next)
    host.report({ state: 'paused', error: null, fps: 0 })
    return
  }

  stopPlaceholder()
  if (capture?.cameraId === next.source.cameraId) return

  stopCapture()
  const exclude = [next.deviceLabel ?? '', 'openemeet virtual camera']
  try {
    await startCapture(next.source, exclude)
  } catch (err) {
    // V4L2 cameras serve one app at a time; this is the common failure by far.
    const busy = err instanceof DOMException && err.name === 'NotReadableError'
    host.report({ state: 'error', error: busy ? 'camera-busy' : err instanceof Error ? err.message : String(err) })
  }
}

// Jobs are applied strictly in order; a burst of updates collapses to the latest.
let chain = Promise.resolve()
let pending: VirtualCameraJob | null = null

host.onJob((next) => {
  const queued = pending !== null
  pending = next
  if (queued) return
  chain = chain.then(async () => {
    const latest = pending!
    pending = null
    await apply(latest)
  })
})

host.ready()
