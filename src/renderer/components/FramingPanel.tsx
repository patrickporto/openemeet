import { useCallback, useEffect, useState } from 'react'
import type { Camera } from '@shared/types'
import { useI18n } from '../i18n/I18nProvider'
import { useToast } from '../hooks/useToast'
import { usePtz } from '../hooks/usePtz'
import { PtzRemote } from './PtzRemote'
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
          <PtzRemote
            pan={position.pan}
            tilt={position.tilt}
            zoom={position.zoom}
            step={jogStep}
            disabled={disabled}
            onChange={move}
            onCommit={reload}
            onHome={() => void center()}
            labels={{
              pan: t('framing.pan'),
              tilt: t('framing.tilt'),
              zoom: t('framing.zoom'),
              up: t('framing.up'),
              down: t('framing.down'),
              left: t('framing.left'),
              right: t('framing.right'),
              zoomIn: t('framing.zoomIn'),
              zoomOut: t('framing.zoomOut'),
              home: t('framing.home'),
            }}
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

          <p className="framing__hint">{t('framing.holdHint')}</p>
          <p className="framing__hint">{t('framing.keyboardHint')}</p>
        </Card>

        <div className="framing__side">
          <Card label={t('framing.preview')}>
            <CameraPreview
              camera={camera}
              active={previewOn}
              blocked={camera.state.tracking === 'privacy'}
              errorLabel={t('framing.previewError')}
              offLabel={t('framing.previewOff')}
              blockedLabel={t('framing.previewBlocked')}
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
