import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import './ui.css'

// --- Layout -----------------------------------------------------------------

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h1 className="panel__title">{title}</h1>
          {subtitle && <p className="panel__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}

export function Card({
  label,
  hint,
  actions,
  children,
  tone = 'default',
  className = '',
}: {
  label?: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
  tone?: 'default' | 'warning'
  className?: string
}) {
  return (
    <div className={`card card--${tone} ${className}`.trim()}>
      {(label || actions) && (
        <div className="card__head">
          <div className="card__labels">
            {label && <span className="eyebrow">{label}</span>}
            {hint && <p className="card__hint">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

// --- Controls ---------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'solid' | 'accent' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'ghost', size = 'md', className = '', ...rest }: ButtonProps) {
  return <button className={`btn btn--${variant} btn--${size} ${className}`.trim()} {...rest} />
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  hint?: string
  icon?: ReactNode
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  stretch = true,
}: {
  options: SegmentedOption<T>[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
  stretch?: boolean
}) {
  return (
    <div
      className={`segmented ${stretch ? 'segmented--stretch' : ''}`.trim()}
      role="radiogroup"
      aria-disabled={disabled}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`segmented__item ${value === option.value ? 'is-active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <span className="segmented__icon">{option.icon}</span>}
          <span className="segmented__label">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={`toggle ${disabled ? 'is-disabled' : ''}`.trim()}>
      <label className="toggle__text" htmlFor={id}>
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'is-on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  disabledHint,
  onChange,
  onCommit,
  onReset,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  disabledHint?: string
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  onReset?: () => void
  format?: (value: number) => string
}) {
  const id = useId()
  // Drives the filled portion of the track via CSS.
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100

  return (
    <div className={`slider ${disabled ? 'is-disabled' : ''}`.trim()}>
      <div className="slider__head">
        <label className="slider__label" htmlFor={id}>
          {label}
        </label>
        <div className="slider__readout">
          <span className="mono slider__value">
            {format ? format(value) : value}
            {unit && <span className="slider__unit">{unit}</span>}
          </span>
          {onReset && (
            <button
              type="button"
              className="slider__reset"
              onClick={onReset}
              disabled={disabled}
              aria-label={`Reset ${label}`}
            >
              <ResetIcon />
            </button>
          )}
        </div>
      </div>

      <input
        id={id}
        className="slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--fill' as string]: `${percent}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={(event) => onCommit?.(Number((event.target as HTMLInputElement).value))}
        onKeyUp={(event) => onCommit?.(Number((event.target as HTMLInputElement).value))}
      />

      {disabled && disabledHint && <p className="slider__disabledHint">{disabledHint}</p>}
    </div>
  )
}

// --- Status -----------------------------------------------------------------

export function StatusDot({ tone }: { tone: 'live' | 'alert' | 'idle' | 'muted' }) {
  return <span className={`dot dot--${tone}`} aria-hidden="true" />
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'live' | 'alert'
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

// --- Icons ------------------------------------------------------------------

export function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8a5 5 0 1 1 1.6 3.66"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M2.2 5.2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
