import { useCallback, useEffect, useRef, useState } from 'react'
import type { Camera } from '@shared/types'
import './CameraPreview.css'

/**
 * Matches a V4L2 device to a MediaDeviceInfo.
 *
 * Chromium labels video inputs with the UVC product name, so we match on that
 * rather than on the /dev/videoN path, which the web layer never sees.
 */
function pickDeviceId(
  devices: MediaDeviceInfo[],
  names: { v4l2Name: string; label: string },
): string | undefined {
  const inputs = devices.filter((d) => d.kind === 'videoinput')
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

  const candidates = [names.v4l2Name, names.label].map(normalise).filter(Boolean)
  for (const candidate of candidates) {
    const hit = inputs.find((d) => {
      const label = normalise(d.label)
      return label.includes(candidate) || candidate.includes(label)
    })
    if (hit) return hit.deviceId
  }

  // A single input and a single camera is unambiguous enough to use.
  return inputs.length === 1 ? inputs[0].deviceId : undefined
}

export function CameraPreview({
  camera,
  active,
  blocked,
  errorLabel,
  offLabel,
  blockedLabel,
}: {
  camera: Camera
  active: boolean
  /** Privacy mode is on: the camera must not be captured at all. */
  blocked: boolean
  errorLabel: string
  offLabel: string
  blockedLabel: string
}) {
  // Only these fields decide which device to open. Depending on the whole
  // camera object would restart the stream on every state broadcast, and
  // re-acquiring the capture makes the firmware leave privacy mode.
  const { id: cameraId, v4l2Name, label, mock } = camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      setError(null)
      if (!active || blocked) return stop()

      if (mock) {
        setError(null)
        return
      }

      try {
        // Labels are only populated once a capture permission has been granted,
        // so take a throwaway stream first when we have no labels yet.
        let devices = await navigator.mediaDevices.enumerateDevices()
        if (devices.every((d) => d.label === '')) {
          const probe = await navigator.mediaDevices.getUserMedia({ video: true })
          probe.getTracks().forEach((track) => track.stop())
          devices = await navigator.mediaDevices.enumerateDevices()
        }
        if (cancelled) return

        const deviceId = pickDeviceId(devices, { v4l2Name, label })
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [active, blocked, cameraId, v4l2Name, label, mock, stop])

  if (blocked) {
    return (
      <div className="preview preview--blocked">
        <ShutterGlyph />
        <span>{blockedLabel}</span>
      </div>
    )
  }

  if (!active) {
    return (
      <div className="preview preview--idle">
        <LensGlyph />
        <span>{offLabel}</span>
      </div>
    )
  }

  if (mock) {
    return (
      <div className="preview preview--mock">
        <div className="preview__mockGrid" aria-hidden="true" />
        <div className="preview__mockBars" aria-hidden="true">
          {['#c8c8c8', '#c8c814', '#14c8c8', '#14c814', '#c814c8', '#c81414', '#1414c8', '#141414'].map(
            (color) => (
              <span key={color} style={{ background: color }} />
            ),
          )}
        </div>
        <span className="preview__mockLabel mono">DEMO SIGNAL · NO HARDWARE</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="preview preview--error">
        <LensGlyph />
        <span>{errorLabel}</span>
        <small className="mono">{error}</small>
      </div>
    )
  }

  return (
    <div className="preview">
      <video ref={videoRef} className="preview__video" muted playsInline />
      <span className="preview__tally" aria-hidden="true" />
    </div>
  )
}

function ShutterGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      <path d="M8.2 8.2 23.8 23.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LensGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <circle cx="16" cy="16" r="4.5" fill="currentColor" opacity="0.45" />
      <path d="M16 5a11 11 0 0 1 9.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
