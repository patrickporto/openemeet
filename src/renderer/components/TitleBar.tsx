import { useEffect, useState, type ReactElement } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import type { TranslationKey } from '@shared/i18n'
import './TitleBar.css'

export type TabId = 'framing' | 'image' | 'smart' | 'presets' | 'settings'

const TABS: { id: TabId; label: TranslationKey; icon: ReactElement }[] = [
  { id: 'framing', label: 'nav.framing', icon: <FramingIcon /> },
  { id: 'image', label: 'nav.image', icon: <ImageIcon /> },
  { id: 'smart', label: 'nav.smart', icon: <SmartIcon /> },
  { id: 'presets', label: 'nav.presets', icon: <PresetsIcon /> },
  { id: 'settings', label: 'nav.settings', icon: <SettingsIcon /> },
]

export function TitleBar({
  tab,
  onTabChange,
  cameraTabsEnabled,
}: {
  tab: TabId
  onTabChange: (tab: TabId) => void
  cameraTabsEnabled: boolean
}) {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.openemeet.window.onMaximizeChange(setMaximized), [])

  return (
    <header className="titlebar">
      {/* The whole bar drags the window; interactive areas opt out in CSS. */}
      <div className="titlebar__lights">
        <button
          type="button"
          className="light light--close"
          aria-label={t('window.close')}
          onClick={() => window.openemeet.window.close()}
        />
        <button
          type="button"
          className="light light--min"
          aria-label={t('window.minimize')}
          onClick={() => window.openemeet.window.minimize()}
        />
        <button
          type="button"
          className={`light light--max ${maximized ? 'is-restored' : ''}`}
          aria-label={t('window.maximize')}
          onClick={() => window.openemeet.window.toggleMaximize()}
        />
      </div>

      <nav className="titlebar__tabs" aria-label={t('appName')}>
        {TABS.map((item) => {
          const disabled = item.id !== 'settings' && !cameraTabsEnabled
          return (
            <button
              key={item.id}
              type="button"
              className={`tab ${tab === item.id ? 'is-active' : ''}`}
              aria-current={tab === item.id}
              disabled={disabled}
              onClick={() => onTabChange(item.id)}
            >
              <span className="tab__icon">{item.icon}</span>
              <span className="tab__label">{t(item.label)}</span>
            </button>
          )
        })}
      </nav>

      <div className="titlebar__end" />
    </header>
  )
}

function FramingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    </svg>
  )
}

function SmartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.2c1.6 0 2.6 1 2.6 2.4 1.5.2 2.4 1.3 2.4 2.7 0 1.6-1.2 2.8-2.9 2.8H5.9C4.2 10.1 3 8.9 3 7.3c0-1.4.9-2.5 2.4-2.7C5.4 3.2 6.4 2.2 8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6.4 12.3h3.2M7.2 14h1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function PresetsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 2.6h8a1 1 0 0 1 1 1v9.2a.5.5 0 0 1-.76.43L8 10.6l-4.24 2.63A.5.5 0 0 1 3 12.8V3.6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
