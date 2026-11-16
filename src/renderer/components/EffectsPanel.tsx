import { useEffect, useRef, useState } from 'react'
import type {
  BackgroundEffect,
  Camera,
  CustomBackground,
  VirtualCameraSettings,
  VirtualCameraStatus,
} from '@shared/types'
import type { TranslationKey } from '@shared/i18n'
import { useI18n } from '../i18n/I18nProvider'
import { useToast } from '../hooks/useToast'
import { BUILTIN_BACKGROUNDS, paintBuiltin, type BuiltinBackground } from '../vcam/backgrounds'
import { CameraPreview } from './CameraPreview'
import { CommandBlock } from './CommandBlock'
import { Button, Card, Panel, Segmented, Slider, StatusDot, Toggle } from './ui'
import './EffectsPanel.css'

const SWATCHES = ['#1f8a5b', '#00b140', '#2f6fde', '#0e0f13', '#f2f3f6', '#b0475f']

function useVcamStatus(): VirtualCameraStatus | null {
  const [status, setStatus] = useState<VirtualCameraStatus | null>(null)
  useEffect(() => {
    void window.openemeet.vcam.status().then(setStatus)
    return window.openemeet.vcam.onStatus(setStatus)
  }, [])
  return status
}

export function EffectsPanel({ camera, config }: { camera: Camera; config: VirtualCameraSettings }) {
  const { t } = useI18n()
  const { attempt } = useToast()
  const status = useVcamStatus()
  const [setupCommand, setSetupCommand] = useState('')
  const [blur, setBlur] = useState(config.blur)

  useEffect(() => setBlur(config.blur), [config.blur])
  useEffect(() => {
    void window.openemeet.vcam.setupCommand().then(setSetupCommand)
  }, [])

  const configure = (values: Partial<VirtualCameraSettings>) =>
    void attempt(() => window.openemeet.vcam.configure(values))

  const servesThisCamera = status?.sourceCameraId === camera.id
  const live = status?.state === 'running' && servesThisCamera
  const deviceLabel = status?.deviceLabel ?? 'openemeet Virtual Camera'

  const toggle = (enabled: boolean) =>
    // Turning it on from a camera's tab means "use this camera".
    configure(enabled ? { enabled, sourceCameraId: camera.id } : { enabled })

  const stateLabel = (() => {
    if (!status) return ''
    if (status.state === 'running') return t('effects.state.running').replace('{fps}', String(status.fps))
    return t(`effects.state.${status.state}` as TranslationKey)
  })()

  const tone = !status || status.state === 'off' ? 'muted' : status.state === 'running' ? 'live' : status.state === 'error' ? 'alert' : 'idle'

  return (
    <Panel title={t('effects.title')} subtitle={t('effects.subtitle')}>
      <div className="effects">
        <div className="effects__main">
          <Card label={t('effects.camera')}>
            <div className="effects__group">
              <Toggle
                label={t('effects.toggle')}
                hint={t('effects.toggleHint').replace('{device}', deviceLabel)}
                checked={config.enabled}
                onChange={toggle}
              />
              <div className="effects__status">
                <StatusDot tone={tone} />
                <span>{stateLabel}</span>
                {status?.device && config.enabled && <span className="mono effects__device">{status.device}</span>}
              </div>

              {config.enabled && status && !servesThisCamera && status.issue !== 'no-loopback' && (
                <div className="effects__other">
                  <span>{t('effects.otherSource')}</span>
                  <Button size="sm" variant="solid" onClick={() => configure({ sourceCameraId: camera.id })}>
                    {t('effects.useThis')}
                  </Button>
                </div>
              )}

              {config.enabled && status?.issue && (
                <div className="effects__issue">
                  <p>{t(`effects.issue.${status.issue}` as TranslationKey)}</p>
                  {status.issue === 'no-loopback' && setupCommand && <CommandBlock command={setupCommand} />}
                </div>
              )}
              {config.enabled && !status?.issue && status?.error && (
                <p className="effects__error">
                  {status.error === 'camera-busy' ? t('effects.cameraBusy').replace('{device}', deviceLabel) : status.error}
                </p>
              )}
            </div>
          </Card>
          <Card label={t('effects.preview')}>
            <CameraPreview
              camera={camera}
              active={live}
              blocked={camera.state.tracking === 'privacy'}
              output={live ? deviceLabel : null}
              errorLabel={t('effects.previewError')}
              offLabel={t('effects.previewOff')}
              blockedLabel={t('effects.previewBlocked')}
            />
            <p className="effects__hint">{t('effects.privacy')}</p>
          </Card>

        </div>

        <div className="effects__side">
          <Card label={t('effects.effect')}>
            <div className="effects__group">
              <Segmented<BackgroundEffect>
                options={(['none', 'blur', 'image', 'color'] as const).map((value) => ({
                  value,
                  label: t(`effects.effect.${value}`),
                }))}
                value={config.effect}
                onChange={(effect) => configure({ effect })}
              />

              {config.effect === 'none' && <p className="effects__hint">{t('effects.noneHint')}</p>}

              {config.effect === 'blur' && (
                <Slider
                  label={t('effects.blur')}
                  value={blur}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={setBlur}
                  onCommit={(value) => configure({ blur: value })}
                />
              )}

              {config.effect === 'color' && (
                <ColorPicker value={config.color} onChange={(color) => configure({ color })} />
              )}
            </div>
          </Card>

          {config.effect === 'image' && (
            <Card label={t('effects.backgrounds')}>
              <BackgroundGallery value={config.image} onChange={(image) => configure({ image })} />
            </Card>
          )}
        </div>
      </div>
    </Panel>
  )
}

// --- Background gallery -----------------------------------------------------

function BackgroundGallery({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const { attempt } = useToast()
  const [custom, setCustom] = useState<CustomBackground[]>([])

  const reload = () => void window.openemeet.vcam.listBackgrounds().then(setCustom)
  useEffect(reload, [])

  const add = async () => {
    const added = await attempt(() => window.openemeet.vcam.addBackground())
    if (!added) return
    reload()
    onChange(added.id)
  }

  const remove = async (id: string) => {
    await attempt(() => window.openemeet.vcam.removeBackground(id))
    reload()
  }

  return (
    <div className="gallery" role="radiogroup" aria-label={t('effects.backgrounds')}>
      {BUILTIN_BACKGROUNDS.map((id) => (
        <Tile
          key={id}
          label={t(`bg.${id}` as TranslationKey)}
          selected={value === `builtin:${id}`}
          onSelect={() => onChange(`builtin:${id}`)}
        >
          <BuiltinThumb id={id} />
        </Tile>
      ))}

      {custom.map((item) => (
        <Tile
          key={item.id}
          label={item.name}
          selected={value === item.id}
          onSelect={() => onChange(item.id)}
          onRemove={() => void remove(item.id)}
          removeLabel={t('effects.remove')}
        >
          <CustomThumb id={item.id} />
        </Tile>
      ))}

      <button type="button" className="tile tile--add" onClick={() => void add()}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>{t('effects.add')}</span>
      </button>
    </div>
  )
}

function Tile({
  label,
  selected,
  onSelect,
  onRemove,
  removeLabel,
  children,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  onRemove?: () => void
  removeLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className={`tile ${selected ? 'is-selected' : ''}`}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        className="tile__button"
        onClick={onSelect}
      >
        {children}
      </button>
      {onRemove && (
        <button type="button" className="tile__remove" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  )
}

function BuiltinThumb({ id }: { id: BuiltinBackground }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) paintBuiltin(ctx, id, canvas.width, canvas.height)
  }, [id])
  return <canvas ref={ref} className="tile__media" width={192} height={108} />
}

function CustomThumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let active = true
    void window.openemeet.vcam.readBackground(id).then((file) => {
      if (!active) return
      objectUrl = URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }))
      setUrl(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])
  return url ? <img className="tile__media" src={url} alt="" /> : <span className="tile__media" />
}

// --- Colour -------------------------------------------------------------------

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  // The native picker streams values while dragging; only commit once it settles.
  useEffect(() => {
    if (draft.toLowerCase() === value.toLowerCase()) return
    const timer = setTimeout(() => onChange(draft), 350)
    return () => clearTimeout(timer)
  }, [draft, value, onChange])

  return (
    <div className="swatches" role="radiogroup" aria-label={t('effects.color')}>
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === color}
          aria-label={color}
          className={`swatch ${value.toLowerCase() === color ? 'is-selected' : ''}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <label className="swatch swatch--custom" title={t('effects.colorCustom')}>
        <input
          type="color"
          value={draft}
          aria-label={t('effects.colorCustom')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <span style={{ background: draft }} />
      </label>
    </div>
  )
}
