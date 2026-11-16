import { useCallback, useEffect, useRef, useState } from 'react'
import type { Camera } from '@shared/types'
import { labelledDevices, pickDeviceId } from '../lib/pickDevice'
import './CameraPreview.css'

export function CameraPreview({
  camera,
  active,
  blocked,
  errorLabel,
  offLabel,
  blockedLabel,
  output,
}: {
  camera: Camera
  active: boolean
  /** Privacy mode is on: the camera must not be captured at all. */
  blocked: boolean
  errorLabel: string
  offLabel: string
  blockedLabel: string
  /** Show this V4L2 device (the virtual camera's output) instead of the camera. */
  output?: string | null
}) {
  // Only these fields decide which device to open. Depending on the whole
  // camera object would restart the stream on every state broadcast, and
  // re-acquiring the capture makes the firmware leave privacy mode.
  const { id: cameraId, v4l2Name, label, mock } = camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped on hotplug so a failed open is retried when devices change.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!error) return
    const retry = () => setAttempt((n) => n + 1)
    navigator.mediaDevices.addEventListener('devicechange', retry)
    return () => navigator.mediaDevices.removeEventListener('devicechange', retry)
  }, [error])

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
        const devices = await labelledDevices()
        if (cancelled) return

        // The virtual camera is matched by its own label; the physical one must
        // never resolve to the virtual device, which has a similar name.
        const deviceId = output
          ? pickDeviceId(devices, { v4l2Name: output, label: output }, { strict: true })
          : pickDeviceId(devices, { v4l2Name, label }, { exclude: ['openemeet virtual camera'] })
        // The loopback node only advertises capture once frames flow into it.
        if (output && !deviceId) throw new Error('Waiting for the virtual camera…')

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
  }, [active, blocked, cameraId, v4l2Name, label, mock, output, attempt, stop])

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
      {output && <span className="preview__badge mono">VIRTUAL</span>}
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
