import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import './PtzRemote.css'

export const PAN_RANGE = 150
export const TILT_RANGE = 90
export const ZOOM_MIN = 100
export const ZOOM_MAX = 150

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)))

/**
 * Travel of the position dot inside the centre knob, in pixels. Percentages
 * cannot be used here: a CSS translate percentage resolves against the moving
 * element's own box, not the dial.
 */
const MARKER_REACH_PX = 17

interface HoldOptions {
  onStep: () => void
  onRelease?: () => void
  disabled?: boolean
}

/**
 * Press-and-hold behaviour of a physical remote: one step on press, then a
 * repeating stream after a short delay for as long as the key is held.
 */
function useHoldRepeat({ onStep, onRelease, disabled }: HoldOptions) {
  const timers = useRef<{ delay?: number; repeat?: number }>({})
  const stepRef = useRef(onStep)
  stepRef.current = onStep

  const clear = useCallback(() => {
    if (timers.current.delay) window.clearTimeout(timers.current.delay)
    if (timers.current.repeat) window.clearInterval(timers.current.repeat)
    timers.current = {}
  }, [])

  const start = useCallback(() => {
    if (disabled) return
    clear()
    stepRef.current()
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => stepRef.current(), 110)
    }, 380)
  }, [clear, disabled])

  const stop = useCallback(() => {
    if (!timers.current.delay && !timers.current.repeat) return
    clear()
    onRelease?.()
  }, [clear, onRelease])

  useEffect(() => clear, [clear])
  return { start, stop }
}

function RemoteKey({
  direction,
  label,
  disabled,
  onStep,
  onRelease,
  children,
}: {
  direction: 'up' | 'right' | 'down' | 'left'
  label: string
  disabled?: boolean
  onStep: () => void
  onRelease: () => void
  children: ReactNode
}) {
  const { start, stop } = useHoldRepeat({ onStep, onRelease, disabled })
  const [pressed, setPressed] = useState(false)

  const press = () => {
    setPressed(true)
    start()
  }
  const release = () => {
    setPressed(false)
    stop()
  }

  return (
    <button
      type="button"
      className={`remote__key remote__key--${direction} ${pressed ? 'is-pressed' : ''}`}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault()
        press()
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      <span className="remote__glyph">{children}</span>
    </button>
  )
}

export interface PtzRemoteProps {
  pan: number
  tilt: number
  zoom: number
  step: number
  disabled?: boolean
  onChange: (values: { pan?: number; tilt?: number; zoom?: number }) => void
  /** Fires when a gesture ends, for one authoritative read-back. */
  onCommit?: () => void
  onHome?: () => void
  labels: {
    pan: string
    tilt: string
    zoom: string
    up: string
    down: string
    left: string
    right: string
    zoomIn: string
    zoomOut: string
    home: string
  }
}

export function PtzRemote({
  pan,
  tilt,
  zoom,
  step,
  disabled,
  onChange,
  onCommit,
  onHome,
  labels,
}: PtzRemoteProps) {
  const commit = useCallback(() => onCommit?.(), [onCommit])

  const move = (axis: 'pan' | 'tilt', delta: number) => () => {
    const range = axis === 'pan' ? PAN_RANGE : TILT_RANGE
    const current = axis === 'pan' ? pan : tilt
    onChange({ [axis]: clamp(current + delta, -range, range) })
  }

  const zoomBy = (delta: number) => () =>
    onChange({ zoom: clamp(zoom + delta, ZOOM_MIN, ZOOM_MAX) })

  const zoomOut = useHoldRepeat({ onStep: zoomBy(-2), onRelease: commit, disabled })
  const zoomIn = useHoldRepeat({ onStep: zoomBy(2), onRelease: commit, disabled })

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    const fine = event.shiftKey ? 1 : step
    const actions: Record<string, () => void> = {
      ArrowUp: move('tilt', fine),
      ArrowDown: move('tilt', -fine),
      ArrowLeft: move('pan', -fine),
      ArrowRight: move('pan', fine),
      '+': zoomBy(fine),
      '=': zoomBy(fine),
      '-': zoomBy(-fine),
      '0': () => onChange({ pan: 0, tilt: 0, zoom: ZOOM_MIN }),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
    commit()
  }

  // The centre knob doubles as a position display: the dot shows where the
  // lens is pointing, and pressing the knob recentres it.
  const markerX = (pan / PAN_RANGE) * MARKER_REACH_PX
  const markerY = (-tilt / TILT_RANGE) * MARKER_REACH_PX
  const centred = pan === 0 && tilt === 0

  return (
    <div className={`remote ${disabled ? 'is-disabled' : ''}`.trim()}>
      <div
        className="remote__dial"
        role="group"
        aria-label={`${labels.pan} / ${labels.tilt}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
      >
        <RemoteKey direction="up" label={labels.up} disabled={disabled} onStep={move('tilt', step)} onRelease={commit}>
          <Chevron />
        </RemoteKey>
        <RemoteKey direction="right" label={labels.right} disabled={disabled} onStep={move('pan', step)} onRelease={commit}>
          <Chevron />
        </RemoteKey>
        <RemoteKey direction="down" label={labels.down} disabled={disabled} onStep={move('tilt', -step)} onRelease={commit}>
          <Chevron />
        </RemoteKey>
        <RemoteKey direction="left" label={labels.left} disabled={disabled} onStep={move('pan', -step)} onRelease={commit}>
          <Chevron />
        </RemoteKey>

        <span className="remote__crosshair" aria-hidden="true" />

        <button
          type="button"
          className="remote__home"
          aria-label={labels.home}
          disabled={disabled}
          onClick={() => onHome?.()}
        >
          <span className="remote__map" aria-hidden="true">
            <span
              className={`remote__mapDot ${centred ? 'is-centred' : ''}`}
              style={{ transform: `translate(${markerX}px, ${markerY}px)` }}
            />
          </span>
        </button>
      </div>

      <div className="remote__zoom">
        <button
          type="button"
          className="remote__zoomKey"
          aria-label={labels.zoomOut}
          disabled={disabled || zoom <= ZOOM_MIN}
          onPointerDown={(e) => {
            e.preventDefault()
            zoomOut.start()
          }}
          onPointerUp={zoomOut.stop}
          onPointerLeave={zoomOut.stop}
          onPointerCancel={zoomOut.stop}
        >
          <MinusIcon />
        </button>

        <span className="remote__zoomValue mono">{(zoom / 100).toFixed(2)}&times;</span>

        <button
          type="button"
          className="remote__zoomKey"
          aria-label={labels.zoomIn}
          disabled={disabled || zoom >= ZOOM_MAX}
          onPointerDown={(e) => {
            e.preventDefault()
            zoomIn.start()
          }}
          onPointerUp={zoomIn.stop}
          onPointerLeave={zoomIn.stop}
          onPointerCancel={zoomIn.stop}
        >
          <PlusIcon />
        </button>
      </div>

      <dl className="remote__readout mono">
        <div>
          <dt>{labels.pan}</dt>
          <dd>
            {pan > 0 ? `+${pan}` : pan}&deg;
          </dd>
        </div>
        <div>
          <dt>{labels.tilt}</dt>
          <dd>
            {tilt > 0 ? `+${tilt}` : tilt}&deg;
          </dd>
        </div>
      </dl>
    </div>
  )
}

function Chevron() {
  return (
    <svg width="13" height="8" viewBox="0 0 14 9" fill="none" aria-hidden="true">
      <path d="M1.5 7.5 7 2l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
