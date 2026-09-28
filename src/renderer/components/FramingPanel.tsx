import { useCallback, useEffect, useState } from 'react'
import type { Camera } from '@shared/types'
import { useI18n } from '../i18n/I18nProvider'
import { useToast } from '../hooks/useToast'
import { usePtz } from '../hooks/usePtz'
import { PtzPad } from './PtzPad'
import { CameraPreview } from './CameraPreview'
import { Button, Card, Panel } from './ui'
import './FramingPanel.css'

const JOG_STEPS = [1, 5, 10, 25]

export function FramingPanel({
  camera,
  jogStep,
  onJogStepChange,
  onPresetSaved,
}: {
  camera: Camera
  jogStep: number
  onJogStepChange: (value: number) => void
  onPresetSaved: () => void
}) {
  const { t } = useI18n()
  const { notify, attempt } = useToast()
  const [previewOn, setPreviewOn] = useState(false)
  const [presetName, setPresetName] = useState('')

  const onError = useCallback((message: string) => notify(message, 'error'), [notify])
  const { position, move, center, reload } = usePtz(camera.id, onError)

  // A different camera means different framing; start from its real position.
  useEffect(() => {
    setPresetName('')
  }, [camera.id])

  const savePreset = useCallback(async () => {
    const name = presetName.trim()
    if (!name) return
    const saved = await attempt(
      () => window.openemeet.presets.save(camera.id, name),
      t('presets.saved'),
    )
    if (saved) {
      setPresetName('')
      onPresetSaved()
    }
  }, [attempt, camera.id, onPresetSaved, presetName, t])

  const disabled = !camera.capabilities.ptz

  return (
    <Panel
      title={t('framing.title')}
      subtitle={t('framing.subtitle')}
      actions={
        <Button variant="ghost" onClick={() => setPreviewOn((on) => !on)}>
          {previewOn ? t('framing.previewStop') : t('framing.previewStart')}
        </Button>
      }
    >
      <div className="framing">
        <Card className="framing__pad">
          <PtzPad
            pan={position.pan}
            tilt={position.tilt}
            zoom={position.zoom}
            disabled={disabled}
            onChange={move}
            onCommit={reload}
            labels={{ pan: t('framing.pan'), tilt: t('framing.tilt'), zoom: t('framing.zoom') }}
          />

          <div className="framing__jog">
            <span className="eyebrow">{t('framing.step')}</span>
            <div className="framing__steps">
              {JOG_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  className={`framing__step ${jogStep === step ? 'is-active' : ''}`}
                  onClick={() => onJogStepChange(step)}
                >
                  {step}
                  {t('common.degrees')}
                </button>
              ))}
            </div>
          </div>

          <div className="framing__dpad">
            <JogButton
              className="framing__dpad--up"
              label="▲"
              disabled={disabled}
              onClick={() => move({ tilt: position.tilt + jogStep })}
              onRelease={reload}
            />
            <JogButton
              className="framing__dpad--left"
              label="◀"
              disabled={disabled}
              onClick={() => move({ pan: position.pan - jogStep })}
              onRelease={reload}
            />
            <Button
              variant="solid"
              className="framing__dpad--center"
              disabled={disabled}
              onClick={() => void center()}
            >
              {t('framing.center')}
            </Button>
            <JogButton
              className="framing__dpad--right"
              label="▶"
              disabled={disabled}
              onClick={() => move({ pan: position.pan + jogStep })}
              onRelease={reload}
            />
            <JogButton
              className="framing__dpad--down"
              label="▼"
              disabled={disabled}
              onClick={() => move({ tilt: position.tilt - jogStep })}
              onRelease={reload}
            />
          </div>

          <p className="framing__hint">{t('framing.keyboardHint')}</p>
        </Card>

        <div className="framing__side">
          <Card label={t('framing.preview')}>
            <CameraPreview
              camera={camera}
              active={previewOn}
              errorLabel={t('framing.previewError')}
              offLabel={t('framing.previewOff')}
            />
            <p className="framing__previewHint">{t('framing.previewHint')}</p>
          </Card>

          <Card label={t('presets.new')} hint={t('framing.savePreset')}>
            <div className="framing__saveRow">
              <input
                className="field"
                value={presetName}
                placeholder={t('presets.namePlaceholder')}
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void savePreset()}
                disabled={disabled}
              />
              <Button
                variant="accent"
                onClick={() => void savePreset()}
                disabled={disabled || !presetName.trim()}
              >
                {t('presets.save')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </Panel>
  )
}

/**
 * A jog control that repeats while held, like a real PTZ joystick.
 */
function JogButton({
  label,
  className,
  disabled,
  onClick,
  onRelease,
}: {
  label: string
  className: string
  disabled?: boolean
  onClick: () => void
  onRelease: () => void
}) {
  const [timers, setTimers] = useState<{ delay?: number; repeat?: number }>({})

  const stop = useCallback(() => {
    setTimers((current) => {
      if (current.delay) window.clearTimeout(current.delay)
      if (current.repeat) window.clearInterval(current.repeat)
      return {}
    })
    onRelease()
  }, [onRelease])

  const start = useCallback(() => {
    if (disabled) return
    onClick()
    const delay = window.setTimeout(() => {
      const repeat = window.setInterval(onClick, 110)
      setTimers((current) => ({ ...current, repeat }))
    }, 380)
    setTimers({ delay })
  }, [disabled, onClick])

  useEffect(
    () => () => {
      if (timers.delay) window.clearTimeout(timers.delay)
      if (timers.repeat) window.clearInterval(timers.repeat)
    },
    [timers],
  )

  return (
    <button
      type="button"
      className={`framing__jogBtn ${className}`}
      disabled={disabled}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {label}
    </button>
  )
}
