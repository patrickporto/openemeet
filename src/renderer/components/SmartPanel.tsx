import { useCallback, useEffect, useState } from 'react'
import type { Camera, TrackingState } from '@shared/types'
import { useI18n } from '../i18n/I18nProvider'
import { useToast } from '../hooks/useToast'
import { Button, Card, Panel, Segmented, Slider, Toggle } from './ui'
import { CommandBlock } from './CommandBlock'
import './SmartPanel.css'

const AUTO_PRIVACY_MAX = 255

export function SmartPanel({ camera }: { camera: Camera }) {
  const { t } = useI18n()
  const { attempt } = useToast()
  const [udevCommand, setUdevCommand] = useState('')
  const [autoPrivacy, setAutoPrivacy] = useState(camera.state.autoPrivacySeconds ?? 0)
  const [flicker, setFlicker] = useState<'off' | '50' | '60' | null>(null)

  useEffect(() => {
    setAutoPrivacy(camera.state.autoPrivacySeconds ?? 0)
  }, [camera.state.autoPrivacySeconds])

  useEffect(() => {
    if (camera.capabilities.hid) return
    void window.openemeet.system.udevHelp().then((help) => setUdevCommand(help.command))
  }, [camera.capabilities.hid])

  // Anti-flicker rides on the standard UVC control, so it can be read back.
  useEffect(() => {
    let active = true
    void window.openemeet.controls
      .list(camera.id, true)
      .then((controls) => {
        if (!active) return
        const control = controls.find((c) => c.name === 'power_line_frequency')
        const byValue: Record<number, 'off' | '50' | '60'> = { 0: 'off', 1: '50', 2: '60' }
        setFlicker(control ? (byValue[control.value] ?? null) : null)
      })
      .catch(() => setFlicker(null))
    return () => {
      active = false
    }
  }, [camera.id])

  const setMode = useCallback(
    (mode: TrackingState) => {
      if (mode === 'unknown') return
      void attempt(() => window.openemeet.smart.setTracking(camera.id, mode))
    },
    [attempt, camera.id],
  )

  if (!camera.capabilities.hid) {
    return (
      <Panel title={t('smart.title')} subtitle={t('smart.subtitle')}>
        <Card tone="warning" label={t('diag.action')}>
          <p className="smart__warnTitle">{t('smart.unavailable')}</p>
          <p className="smart__warnHint">{t('smart.unavailableHint')}</p>
          {udevCommand && <CommandBlock command={udevCommand} />}
        </Card>
      </Panel>
    )
  }

  return (
    <Panel
      title={t('smart.title')}
      subtitle={t('smart.subtitle')}
      actions={
        <Button
          variant="ghost"
          onClick={() => void attempt(() => window.openemeet.smart.sync(camera.id))}
        >
          {t('smart.sync')}
        </Button>
      }
    >
      <div className="smart">
        <Card label={t('smart.mode')}>
          <Segmented<Exclude<TrackingState, 'unknown'>>
            options={[
              { value: 'idle', label: t('smart.mode.idle') },
              { value: 'track', label: t('smart.mode.track') },
              { value: 'privacy', label: t('smart.mode.privacy') },
            ]}
            value={camera.state.tracking === 'unknown' ? null : camera.state.tracking}
            onChange={setMode}
          />
          <p className="smart__modeHint">
            {camera.state.tracking === 'track'
              ? t('smart.mode.trackHint')
              : camera.state.tracking === 'privacy'
                ? t('smart.mode.privacyHint')
                : t('smart.mode.idleHint')}
          </p>
        </Card>

        <Card label={t('smart.audio')}>
          <Segmented
            options={[
              { value: 'nc', label: t('smart.audio.nc') },
              { value: 'live', label: t('smart.audio.live') },
              { value: 'org', label: t('smart.audio.org') },
            ]}
            value={camera.state.audio === 'unknown' ? null : camera.state.audio}
            onChange={(mode) =>
              void attempt(() => window.openemeet.smart.setAudio(camera.id, mode))
            }
          />
          <p className="smart__modeHint">
            {camera.state.audio === 'live'
              ? t('smart.audio.liveHint')
              : camera.state.audio === 'org'
                ? t('smart.audio.orgHint')
                : t('smart.audio.ncHint')}
          </p>
        </Card>

        <Card label={t('smart.gesture')}>
          <Toggle
            label={t('smart.gesture')}
            hint={t('smart.gestureHint')}
            checked={camera.state.gesture === 'on'}
            onChange={(enabled) =>
              void attempt(() => window.openemeet.smart.setGesture(camera.id, enabled))
            }
          />
        </Card>

        <Card label={t('smart.autoPrivacy')} hint={t('smart.autoPrivacyHint')}>
          <Slider
            label={t('smart.autoPrivacy')}
            value={autoPrivacy}
            min={0}
            max={AUTO_PRIVACY_MAX}
            unit={autoPrivacy === 0 ? undefined : t('common.seconds')}
            format={(value) => (value === 0 ? t('smart.autoPrivacy.off') : String(value))}
            onChange={setAutoPrivacy}
            onCommit={(value) =>
              void attempt(() => window.openemeet.smart.setAutoPrivacy(camera.id, value))
            }
          />
        </Card>

        <Card label={t('smart.flicker')} hint={t('smart.flickerHint')}>
          <Segmented
            options={[
              { value: 'off', label: t('smart.flicker.off') },
              { value: '50', label: '50 Hz' },
              { value: '60', label: '60 Hz' },
            ]}
            value={flicker}
            onChange={(mode) => {
              setFlicker(mode)
              void attempt(() => window.openemeet.smart.setFlicker(camera.id, mode))
            }}
          />
        </Card>
      </div>
    </Panel>
  )
}
