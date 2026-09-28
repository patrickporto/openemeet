import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Preset } from '@shared/types'
import { I18nProvider } from './i18n/I18nProvider'
import { ToastProvider, useToast } from './hooks/useToast'
import { useCameras, useSettings } from './hooks/useCameras'
import { Sidebar } from './components/Sidebar'
import { TitleBar, type TabId } from './components/TitleBar'
import { FramingPanel } from './components/FramingPanel'
import { ImagePanel } from './components/ImagePanel'
import { SmartPanel } from './components/SmartPanel'
import { PresetsPanel } from './components/PresetsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/ui'
import { useI18n } from './i18n/I18nProvider'
import './App.css'

export function App() {
  const { settings, patch } = useSettings()

  // Hold the first paint until settings resolve, so the theme never flashes.
  if (!settings) return <div className="boot" />

  return (
    <I18nProvider locale={settings.locale}>
      <ToastProvider>
        <Shell settings={settings} onPatch={patch} />
      </ToastProvider>
    </I18nProvider>
  )
}

function Shell({
  settings,
  onPatch,
}: {
  settings: import('@shared/types').AppSettings
  onPatch: (values: Partial<import('@shared/types').AppSettings>) => void
}) {
  const { t } = useI18n()
  const { cameras, loading, refresh } = useCameras()
  const [selectedId, setSelectedId] = useState<string | null>(settings.lastCameraId)
  const [tab, setTab] = useState<TabId>('framing')
  const [presets, setPresets] = useState<Preset[]>([])

  const selected = useMemo(
    () => cameras.find((camera) => camera.id === selectedId) ?? cameras[0] ?? null,
    [cameras, selectedId],
  )

  // Keep the selection valid as cameras come and go.
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    if (!selected && selectedId) setSelectedId(null)
  }, [selected, selectedId])

  useEffect(() => {
    if (selectedId) onPatch({ lastCameraId: selectedId })
    // Persisting the selection should not re-run when onPatch changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const reloadPresets = useCallback(() => {
    if (!selected) return setPresets([])
    void window.openemeet.presets.list(selected.id).then(setPresets)
  }, [selected])

  useEffect(reloadPresets, [reloadPresets])

  // Theme follows the setting, with "system" deferring to the OS preference.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme !== 'system') {
      root.setAttribute('data-theme', settings.theme)
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => root.setAttribute('data-theme', media.matches ? 'light' : 'dark')
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  // The tray can ask the window to jump to a camera or tab.
  useEffect(
    () =>
      window.openemeet.onNavigate((payload) => {
        if (payload.cameraId) setSelectedId(payload.cameraId)
        if (payload.tab) setTab(payload.tab as TabId)
      }),
    [],
  )

  // A camera-scoped tab makes no sense with nothing selected.
  useEffect(() => {
    if (!selected && tab !== 'settings') setTab('settings')
  }, [selected, tab])

  return (
    <div className="app">
      <TitleBar tab={tab} onTabChange={setTab} cameraTabsEnabled={Boolean(selected)} />

      <div className="app__body">
        <Sidebar
          cameras={cameras}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onRefresh={() => void refresh()}
          loading={loading}
        />

        <main className="app__content">
          {tab === 'settings' ? (
            <SettingsPanel settings={settings} onPatch={onPatch} />
          ) : !selected ? (
            <EmptyState title={t('sidebar.noCameras')} hint={t('sidebar.noCamerasHint')} />
          ) : tab === 'framing' ? (
            <FramingPanel
              camera={selected}
              jogStep={settings.jogStepDegrees}
              onJogStepChange={(value) => onPatch({ jogStepDegrees: value })}
              onPresetSaved={reloadPresets}
            />
          ) : tab === 'image' ? (
            <ImagePanel camera={selected} />
          ) : tab === 'smart' ? (
            <SmartPanel camera={selected} />
          ) : (
            <PresetsPanel camera={selected} presets={presets} onReload={reloadPresets} />
          )}
        </main>
      </div>

      <ToastStack />
    </div>
  )
}

function ToastStack() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.tone}`}
          onClick={() => dismiss(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}
