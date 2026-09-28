import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Camera, V4l2Control } from '@shared/types'
import { PTZ_CONTROLS } from '@shared/protocol'
import { useI18n } from '../i18n/I18nProvider'
import { useToast } from '../hooks/useToast'
import { Button, Card, Panel, Segmented, Slider, Toggle, EmptyState } from './ui'
import { controlLabel, menuLabel, type TranslationKey } from '@shared/i18n'
import './ImagePanel.css'

const GROUPS: { key: TranslationKey; members: string[] }[] = [
  {
    key: 'image.group.exposure',
    members: [
      'auto_exposure',
      'exposure_time_absolute',
      'exposure_dynamic_framerate',
      'gain',
      'brightness',
      'contrast',
      'backlight_compensation',
    ],
  },
  {
    key: 'image.group.colour',
    members: ['white_balance_automatic', 'white_balance_temperature', 'saturation', 'hue', 'gamma'],
  },
  {
    key: 'image.group.detail',
    members: ['sharpness', 'focus_automatic_continuous', 'focus_absolute', 'power_line_frequency'],
  },
]

export function ImagePanel({ camera }: { camera: Camera }) {
  const { t, locale } = useI18n()
  const { notify, attempt } = useToast()
  const [controls, setControls] = useState<V4l2Control[]>([])
  const [loading, setLoading] = useState(true)
  /** Slider positions while dragging, before the hardware confirms. */
  const [draft, setDraft] = useState<Record<string, number>>({})

  const load = useCallback(
    async (force = false) => {
      setLoading(true)
      try {
        const list = await window.openemeet.controls.list(camera.id, force)
        setControls(list)
        setDraft({})
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), 'error')
      } finally {
        setLoading(false)
      }
    },
    [camera.id, notify],
  )

  useEffect(() => {
    void load(true)
  }, [load])

  const commit = useCallback(
    async (name: string, value: number) => {
      const ok = await attempt(() => window.openemeet.controls.set(camera.id, name, value))
      // Auto/manual partners flip each other, so re-read the whole set.
      if (ok !== undefined) await load(true)
    },
    [attempt, camera.id, load],
  )

  const reset = useCallback(
    async (name: string) => {
      await attempt(() => window.openemeet.controls.reset(camera.id, name))
      await load(true)
    },
    [attempt, camera.id, load],
  )

  const resetAll = useCallback(async () => {
    for (const control of controls) {
      if (control.type === 'button' || PTZ_CONTROLS.includes(control.name as never)) continue
      if (control.value === control.default) continue
      await attempt(() => window.openemeet.controls.set(camera.id, control.name, control.default))
    }
    await load(true)
  }, [attempt, camera.id, controls, load])

  // PTZ lives in the Framing panel; everything else is grouped by topic here.
  const adjustable = useMemo(
    () => controls.filter((c) => !PTZ_CONTROLS.includes(c.name as never) && c.type !== 'button'),
    [controls],
  )

  const grouped = useMemo(() => {
    const seen = new Set<string>()
    const sections = GROUPS.map((group) => {
      const members = group.members
        .map((name) => adjustable.find((c) => c.name === name))
        .filter((c): c is V4l2Control => Boolean(c))
      members.forEach((c) => seen.add(c.name))
      return { key: group.key, controls: members }
    }).filter((section) => section.controls.length > 0)

    const rest = adjustable.filter((c) => !seen.has(c.name))
    if (rest.length > 0) sections.push({ key: 'image.group.other' as TranslationKey, controls: rest })
    return sections
  }, [adjustable])

  const renderControl = (control: V4l2Control) => {
    const value = draft[control.name] ?? control.value

    if (control.type === 'bool') {
      return (
        <Toggle
          key={control.name}
          label={controlLabel(locale, control.name)}
          checked={control.value === 1}
          onChange={(checked) => void commit(control.name, checked ? 1 : 0)}
        />
      )
    }

    if (control.type === 'menu' && control.menu?.length) {
      return (
        <div key={control.name} className="imagePanel__menu">
          <span className="imagePanel__menuLabel">{controlLabel(locale, control.name)}</span>
          <Segmented
            options={control.menu.map((item) => ({
              value: String(item.value),
              label: menuLabel(locale, item.label),
            }))}
            value={String(control.value)}
            onChange={(next) => void commit(control.name, Number(next))}
          />
        </div>
      )
    }

    return (
      <Slider
        key={control.name}
        label={controlLabel(locale, control.name)}
        value={value}
        min={control.min}
        max={control.max}
        step={control.step || 1}
        disabled={control.inactive}
        disabledHint={t('image.inactive')}
        onChange={(next) => setDraft((current) => ({ ...current, [control.name]: next }))}
        onCommit={(next) => void commit(control.name, next)}
        onReset={() => void reset(control.name)}
      />
    )
  }

  return (
    <Panel
      title={t('image.title')}
      subtitle={t('image.subtitle')}
      actions={
        <Button variant="ghost" onClick={() => void resetAll()} disabled={loading || adjustable.length === 0}>
          {t('image.resetAll')}
        </Button>
      }
    >
      {!loading && adjustable.length === 0 ? (
        <EmptyState title={t('image.noControls')} />
      ) : (
        <div className="imagePanel">
          {grouped.map((section) => (
            <Card key={section.key} label={t(section.key)}>
              <div className="imagePanel__group">{section.controls.map(renderControl)}</div>
            </Card>
          ))}
        </div>
      )}
    </Panel>
  )
}
