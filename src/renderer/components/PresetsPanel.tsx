import { useCallback, useEffect, useState } from 'react'
import type { Camera, Preset } from '@shared/types'
import { useI18n } from '../i18n/I18nProvider'
import { useToast } from '../hooks/useToast'
import { Button, Card, EmptyState, Panel } from './ui'
import './PresetsPanel.css'

export function PresetsPanel({
  camera,
  presets,
  onReload,
}: {
  camera: Camera
  presets: Preset[]
  onReload: () => void
}) {
  const { t } = useI18n()
  const { attempt } = useToast()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    setEditing(null)
    setName('')
  }, [camera.id])

  const save = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const saved = await attempt(
      () => window.openemeet.presets.save(camera.id, trimmed),
      t('presets.saved'),
    )
    if (saved) {
      setName('')
      onReload()
    }
  }, [attempt, camera.id, name, onReload, t])

  const commitRename = useCallback(
    async (preset: Preset) => {
      const trimmed = editName.trim()
      setEditing(null)
      if (!trimmed || trimmed === preset.name) return
      await attempt(() => window.openemeet.presets.rename(camera.id, preset.id, trimmed))
      onReload()
    },
    [attempt, camera.id, editName, onReload],
  )

  const disabled = !camera.capabilities.ptz

  return (
    <Panel title={t('presets.title')} subtitle={t('presets.subtitle')}>
      <Card label={t('presets.new')}>
        <div className="presets__saveRow">
          <input
            className="field"
            value={name}
            placeholder={t('presets.namePlaceholder')}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void save()}
          />
          <Button variant="accent" onClick={() => void save()} disabled={disabled || !name.trim()}>
            {t('presets.save')}
          </Button>
        </div>
      </Card>

      {presets.length === 0 ? (
        <EmptyState title={t('presets.empty')} hint={t('presets.emptyHint')} />
      ) : (
        <div className="presets__list">
          {presets.map((preset) => (
            <div key={preset.id} className="presetRow">
              <div className="presetRow__main">
                {editing === preset.id ? (
                  <input
                    className="field presetRow__rename"
                    value={editName}
                    autoFocus
                    onChange={(event) => setEditName(event.target.value)}
                    onBlur={() => void commitRename(preset)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void commitRename(preset)
                      if (event.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="presetRow__name"
                    onDoubleClick={() => {
                      setEditing(preset.id)
                      setEditName(preset.name)
                    }}
                    onClick={() =>
                      void attempt(
                        () => window.openemeet.presets.apply(camera.id, preset.id),
                        t('presets.applied'),
                      )
                    }
                  >
                    {preset.name}
                  </button>
                )}
                {/* Presets are stored in degrees, exactly as the PTZ panel reports them. */}
                <span className="presetRow__coords mono">
                  {preset.pan > 0 ? '+' : ''}
                  {preset.pan}&deg; · {preset.tilt > 0 ? '+' : ''}
                  {preset.tilt}&deg; · {(preset.zoom / 100).toFixed(2)}&times;
                </span>
              </div>

              <div className="presetRow__actions">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void attempt(
                      () => window.openemeet.presets.apply(camera.id, preset.id),
                      t('presets.applied'),
                    )
                  }
                  disabled={disabled}
                >
                  {t('presets.apply')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await attempt(() => window.openemeet.presets.overwrite(camera.id, preset.id))
                    onReload()
                  }}
                  disabled={disabled}
                >
                  {t('presets.overwrite')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await attempt(
                      () => window.openemeet.presets.remove(camera.id, preset.id),
                      t('presets.deleted'),
                    )
                    onReload()
                  }}
                >
                  {t('presets.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
