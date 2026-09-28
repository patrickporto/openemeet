import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import './PtzPad.css'

export const PAN_RANGE = 150
export const TILT_RANGE = 90
export const ZOOM_MIN = 100
export const ZOOM_MAX = 150

const SIZE = 320
const CENTER = SIZE / 2
const RING_RADIUS = 139
/** Degrees either side of top that the zoom ring sweeps. */
const RING_SPAN = 140

const GATE = { x: 70, y: 70, size: 180, radius: 26 }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Polar helper: 0deg is the top of the ring, positive is clockwise. */
function pointAt(angleDeg: number, radius = RING_RADIUS) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) }
}

function arcPath(fromDeg: number, toDeg: number, radius = RING_RADIUS) {
  const start = pointAt(fromDeg, radius)
  const end = pointAt(toDeg, radius)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export interface PtzPadProps {
  pan: number
  tilt: number
  zoom: number
  disabled?: boolean
  onChange: (values: { pan?: number; tilt?: number; zoom?: number }) => void
  /** Called when the user finishes a gesture, for a final authoritative write. */
  onCommit?: () => void
  labels: { pan: string; tilt: string; zoom: string }
}

export function PtzPad({ pan, tilt, zoom, disabled, onChange, onCommit, labels }: PtzPadProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'gate' | 'ring' | null>(null)

  /** Converts a client point into the SVG's own coordinate space. */
  const toLocal = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: CENTER, y: CENTER }
    return {
      x: ((event.clientX - rect.left) / rect.width) * SIZE,
      y: ((event.clientY - rect.top) / rect.height) * SIZE,
    }
  }, [])

  const applyGate = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const { x, y } = toLocal(event)
      const nx = clamp((x - GATE.x) / GATE.size, 0, 1)
      const ny = clamp((y - GATE.y) / GATE.size, 0, 1)
      onChange({
        pan: Math.round((nx * 2 - 1) * PAN_RANGE),
        // Screen y grows downward; tilt grows upward.
        tilt: Math.round((1 - ny * 2) * TILT_RANGE),
      })
    },
    [onChange, toLocal],
  )

  const applyRing = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const { x, y } = toLocal(event)
      // atan2 with swapped args gives an angle measured clockwise from the top.
      let angle = (Math.atan2(x - CENTER, CENTER - y) * 180) / Math.PI
      angle = clamp(angle, -RING_SPAN, RING_SPAN)
      const ratio = (angle + RING_SPAN) / (RING_SPAN * 2)
      onChange({ zoom: Math.round(ZOOM_MIN + ratio * (ZOOM_MAX - ZOOM_MIN)) })
    },
    [onChange, toLocal],
  )

  const handlePointerDown = useCallback(
    (target: 'gate' | 'ring') => (event: ReactPointerEvent) => {
      if (disabled) return
      event.preventDefault()
      dragging.current = target
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
      target === 'gate' ? applyGate(event) : applyRing(event)
    },
    [applyGate, applyRing, disabled],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (disabled || !dragging.current) return
      dragging.current === 'gate' ? applyGate(event) : applyRing(event)
    },
    [applyGate, applyRing, disabled],
  )

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = null
    onCommit?.()
  }, [onCommit])

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (disabled) return
      const delta = event.deltaY < 0 ? 2 : -2
      onChange({ zoom: clamp(zoom + delta, ZOOM_MIN, ZOOM_MAX) })
    },
    [disabled, onChange, zoom],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return
      const step = event.shiftKey ? 1 : 5
      const moves: Record<string, () => void> = {
        ArrowLeft: () => onChange({ pan: clamp(pan - step, -PAN_RANGE, PAN_RANGE) }),
        ArrowRight: () => onChange({ pan: clamp(pan + step, -PAN_RANGE, PAN_RANGE) }),
        ArrowUp: () => onChange({ tilt: clamp(tilt + step, -TILT_RANGE, TILT_RANGE) }),
        ArrowDown: () => onChange({ tilt: clamp(tilt - step, -TILT_RANGE, TILT_RANGE) }),
        '+': () => onChange({ zoom: clamp(zoom + step, ZOOM_MIN, ZOOM_MAX) }),
        '=': () => onChange({ zoom: clamp(zoom + step, ZOOM_MIN, ZOOM_MAX) }),
        '-': () => onChange({ zoom: clamp(zoom - step, ZOOM_MIN, ZOOM_MAX) }),
        '0': () => onChange({ pan: 0, tilt: 0, zoom: ZOOM_MIN }),
      }

      const move = moves[event.key]
      if (!move) return
      event.preventDefault()
      move()
      onCommit?.()
    },
    [disabled, onChange, onCommit, pan, tilt, zoom],
  )

  const reticle = {
    x: GATE.x + ((pan + PAN_RANGE) / (PAN_RANGE * 2)) * GATE.size,
    y: GATE.y + ((TILT_RANGE - tilt) / (TILT_RANGE * 2)) * GATE.size,
  }

  const zoomRatio = (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)
  const zoomAngle = -RING_SPAN + zoomRatio * RING_SPAN * 2
  const zoomHandle = pointAt(zoomAngle)

  return (
    <div className={`ptzpad ${disabled ? 'is-disabled' : ''}`.trim()}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="ptzpad__svg"
        role="group"
        aria-label={`${labels.pan} / ${labels.tilt} / ${labels.zoom}`}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
      >
        <defs>
          <radialGradient id="padGlass" cx="0.35" cy="0.28" r="0.9">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="0.6" stopColor="var(--accent)" stopOpacity="0.02" />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="padBarrel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--stroke-strong)" />
            <stop offset="1" stopColor="var(--stroke-hairline)" />
          </linearGradient>
        </defs>

        {/* Barrel */}
        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS + 14} className="ptzpad__barrel" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS + 14}
          fill="none"
          stroke="url(#padBarrel)"
          strokeWidth="1"
        />

        {/* Zoom ring */}
        <path d={arcPath(-RING_SPAN, RING_SPAN)} className="ptzpad__ringTrack" />
        <path d={arcPath(-RING_SPAN, zoomAngle)} className="ptzpad__ringFill" />

        {/* Ring ticks every 10% of the zoom range */}
        {Array.from({ length: 11 }, (_, i) => {
          const angle = -RING_SPAN + (i / 10) * RING_SPAN * 2
          const outer = pointAt(angle, RING_RADIUS + 9)
          const inner = pointAt(angle, RING_RADIUS + (i % 5 === 0 ? 3 : 6))
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className={`ptzpad__tick ${i % 5 === 0 ? 'is-major' : ''}`}
            />
          )
        })}

        {/* Ring hit area sits above the ticks so the whole ring is grabbable */}
        <path
          d={arcPath(-RING_SPAN, RING_SPAN)}
          className="ptzpad__ringHit"
          onPointerDown={handlePointerDown('ring')}
        />
        <circle cx={zoomHandle.x} cy={zoomHandle.y} r="9" className="ptzpad__ringKnob" />
        <circle cx={zoomHandle.x} cy={zoomHandle.y} r="3.2" className="ptzpad__ringKnobDot" />

        {/* End labels, so the ring reads as a zoom scale rather than decoration */}
        <text
          {...pointAt(-RING_SPAN, RING_RADIUS + 24)}
          className="ptzpad__scaleLabel"
          textAnchor="middle"
        >
          1.0&#215;
        </text>
        <text
          {...pointAt(RING_SPAN, RING_RADIUS + 24)}
          className="ptzpad__scaleLabel"
          textAnchor="middle"
        >
          1.5&#215;
        </text>

        {/* Film gate */}
        <rect
          x={GATE.x}
          y={GATE.y}
          width={GATE.size}
          height={GATE.size}
          rx={GATE.radius}
          className="ptzpad__gateGlow"
          fill="url(#padGlass)"
        />
        <rect
          x={GATE.x}
          y={GATE.y}
          width={GATE.size}
          height={GATE.size}
          rx={GATE.radius}
          className="ptzpad__gate"
        />

        {/* Thirds grid */}
        <g className="ptzpad__grid">
          {[1, 2].map((i) => (
            <line
              key={`v${i}`}
              x1={GATE.x + (GATE.size / 3) * i}
              y1={GATE.y + 8}
              x2={GATE.x + (GATE.size / 3) * i}
              y2={GATE.y + GATE.size - 8}
            />
          ))}
          {[1, 2].map((i) => (
            <line
              key={`h${i}`}
              x1={GATE.x + 8}
              y1={GATE.y + (GATE.size / 3) * i}
              x2={GATE.x + GATE.size - 8}
              y2={GATE.y + (GATE.size / 3) * i}
            />
          ))}
        </g>

        {/* Reticle */}
        <g className="ptzpad__reticle" transform={`translate(${reticle.x} ${reticle.y})`}>
          <circle r="21" className="ptzpad__reticleHalo" />
          <circle r="12" className="ptzpad__reticleRing" />
          <line x1="-20" y1="0" x2="-15" y2="0" />
          <line x1="15" y1="0" x2="20" y2="0" />
          <line x1="0" y1="-20" x2="0" y2="-15" />
          <line x1="0" y1="15" x2="0" y2="20" />
          <circle r="2.4" className="ptzpad__reticleDot" />
        </g>

        {/* Gate hit area, focusable for keyboard framing */}
        <rect
          x={GATE.x}
          y={GATE.y}
          width={GATE.size}
          height={GATE.size}
          rx={GATE.radius}
          className="ptzpad__gateHit"
          tabIndex={disabled ? -1 : 0}
          role="application"
          aria-label={`${labels.pan} ${pan}, ${labels.tilt} ${tilt}`}
          onPointerDown={handlePointerDown('gate')}
          onKeyDown={handleKeyDown}
        />
      </svg>

      <div className="ptzpad__readout mono" aria-hidden="true">
        <span>
          <em>{labels.pan}</em>
          {pan > 0 ? `+${pan}` : pan}&deg;
        </span>
        <span>
          <em>{labels.tilt}</em>
          {tilt > 0 ? `+${tilt}` : tilt}&deg;
        </span>
        <span>
          <em>{labels.zoom}</em>
          {(zoom / 100).toFixed(2)}&times;
        </span>
      </div>
    </div>
  )
}
