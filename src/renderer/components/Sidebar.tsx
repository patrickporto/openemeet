import type { Camera } from '@shared/types'
import { useI18n } from '../i18n/I18nProvider'
import { Badge, StatusDot } from './ui'
import './Sidebar.css'

function statusTone(camera: Camera): 'live' | 'alert' | 'idle' | 'muted' {
  if (!camera.capabilities.hid) return 'muted'
  if (camera.state.tracking === 'privacy') return 'alert'
  if (camera.state.tracking === 'track') return 'live'
  return 'idle'
}

export function Sidebar({
  cameras,
  selectedId,
  onSelect,
  onRefresh,
  loading,
}: {
  cameras: Camera[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
  loading: boolean
}) {
  const { t } = useI18n()

  const statusLabel = (camera: Camera) => {
    if (!camera.capabilities.hid) return t('status.noHid')
    if (camera.state.tracking === 'privacy') return t('status.privacy')
    if (camera.state.tracking === 'track') return t('status.tracking')
    if (camera.state.tracking === 'idle') return t('status.idle')
    return t('status.online')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <span className="eyebrow">{t('sidebar.cameras')}</span>
        <button
          type="button"
          className={`sidebar__refresh ${loading ? 'is-busy' : ''}`}
          onClick={onRefresh}
          aria-label={t('sidebar.refresh')}
          title={t('sidebar.refresh')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13 8a5 5 0 1 1-1.6-3.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path
              d="M13.8 2.2v3h-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="sidebar__list">
        {cameras.length === 0 ? (
          <div className="sidebar__empty">
            <p className="sidebar__emptyTitle">{t('sidebar.noCameras')}</p>
            <p className="sidebar__emptyHint">{t('sidebar.noCamerasHint')}</p>
          </div>
        ) : (
          cameras.map((camera) => (
            <button
              key={camera.id}
              type="button"
              className={`camRow ${selectedId === camera.id ? 'is-active' : ''}`}
              onClick={() => onSelect(camera.id)}
            >
              <span className="camRow__lens" aria-hidden="true">
                <span className="camRow__iris" />
              </span>

              <span className="camRow__body">
                <span className="camRow__name">{camera.label}</span>
                <span className="camRow__status">
                  <StatusDot tone={statusTone(camera)} />
                  {statusLabel(camera)}
                </span>
              </span>

              {camera.mock && <Badge tone="accent">{t('sidebar.demo')}</Badge>}
              {!camera.isPixy && <Badge>{t('sidebar.generic')}</Badge>}
            </button>
          ))
        )}
      </div>

      <div className="sidebar__foot">
        <span className="mono sidebar__count">
          {cameras.length > 0 ? `${cameras.length} × PIXY` : '—'}
        </span>
      </div>
    </aside>
  )
}
