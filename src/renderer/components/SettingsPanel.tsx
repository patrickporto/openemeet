import { useEffect, useState } from 'react'
import type { AppSettings, SystemDiagnostics } from '@shared/types'
import type { TranslationKey } from '@shared/i18n'
import { useI18n } from '../i18n/I18nProvider'
import { Card, Panel, Segmented, Toggle } from './ui'
import { CommandBlock } from './CommandBlock'
import './SettingsPanel.css'

interface CheckRow {
  key: TranslationKey
  ok: boolean
  fix?: TranslationKey
  command?: string
}

export function SettingsPanel({
  settings,
  onPatch,
}: {
  settings: AppSettings
  onPatch: (values: Partial<AppSettings>) => void
}) {
  const { t } = useI18n()
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null)
  const [udevCommand, setUdevCommand] = useState('')

  useEffect(() => {
    void window.openemeet.system.diagnostics().then(setDiagnostics)
    void window.openemeet.system.udevHelp().then((help) => setUdevCommand(help.command))
  }, [])

  const checks: CheckRow[] = diagnostics
    ? [
        { key: 'diag.v4l2', ok: diagnostics.v4l2CtlInstalled, fix: 'diag.v4l2Fix' },
        {
          key: 'diag.udev',
          ok: diagnostics.udevRuleInstalled,
          fix: 'diag.udevFix',
          command: udevCommand,
        },
        {
          key: 'diag.videoGroup',
          ok: diagnostics.userInVideoGroup,
          fix: 'diag.videoGroupFix',
          command: 'sudo usermod -aG video "$USER"',
        },
        {
          key: 'diag.tray',
          ok: diagnostics.trayAvailable,
          fix:
            diagnostics.gnomeAppIndicatorExtension === 'disabled'
              ? 'diag.trayFixDisabled'
              : 'diag.trayFixMissing',
        },
      ]
    : []

  return (
    <Panel title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <div className="settings">
        <Card label={t('settings.appearance')}>
          <div className="settings__group">
            <div className="settings__row">
              <span className="settings__rowLabel">{t('settings.language')}</span>
              <Segmented
                stretch={false}
                options={[
                  { value: 'pt-BR', label: 'Português' },
                  { value: 'en', label: 'English' },
                ]}
                value={settings.locale}
                onChange={(locale) => onPatch({ locale })}
              />
            </div>
            <div className="settings__row">
              <span className="settings__rowLabel">{t('settings.theme')}</span>
              <Segmented
                stretch={false}
                options={[
                  { value: 'dark', label: t('settings.theme.dark') },
                  { value: 'light', label: t('settings.theme.light') },
                  { value: 'system', label: t('settings.theme.system') },
                ]}
                value={settings.theme}
                onChange={(theme) => onPatch({ theme })}
              />
            </div>
          </div>
        </Card>

        <Card label={t('settings.behaviour')}>
          <div className="settings__group">
            <Toggle
              label={t('settings.closeToTray')}
              checked={settings.closeToTray}
              onChange={(closeToTray) => onPatch({ closeToTray })}
              disabled={diagnostics ? !diagnostics.trayAvailable : false}
            />
            <Toggle
              label={t('settings.startMinimized')}
              checked={settings.startMinimized}
              onChange={(startMinimized) => onPatch({ startMinimized })}
              disabled={diagnostics ? !diagnostics.trayAvailable : false}
            />
          </div>
        </Card>

        <Card label={t('settings.devices')}>
          <div className="settings__group">
            <Toggle
              label={t('settings.mockDevices')}
              hint={t('settings.mockDevicesHint')}
              checked={settings.mockDevices}
              onChange={(mockDevices) => onPatch({ mockDevices })}
            />
            <Toggle
              label={t('settings.genericCameras')}
              hint={t('settings.genericCamerasHint')}
              checked={(settings as AppSettings & { includeGenericCameras?: boolean }).includeGenericCameras ?? false}
              onChange={(includeGenericCameras) =>
                onPatch({ includeGenericCameras } as Partial<AppSettings>)
              }
            />
          </div>
        </Card>

        <Card label={t('settings.system')} className="settings__system">
          <div className="settings__checks">
            {checks.map((check) => (
              <div key={check.key} className="check">
                <div className="check__head">
                  <span className={`check__mark ${check.ok ? 'is-ok' : 'is-warn'}`} aria-hidden="true">
                    {check.ok ? '✓' : '!'}
                  </span>
                  <span className="check__label">{t(check.key)}</span>
                  <span className={`check__state ${check.ok ? 'is-ok' : 'is-warn'}`}>
                    {check.ok ? t('diag.ok') : t('diag.action')}
                  </span>
                </div>
                {!check.ok && check.fix && <p className="check__fix">{t(check.fix)}</p>}
                {!check.ok && check.command && <CommandBlock command={check.command} />}
              </div>
            ))}
          </div>

          {diagnostics && (
            <p className="settings__env mono">
              {diagnostics.desktop} · {diagnostics.sessionType}
            </p>
          )}
        </Card>
      </div>
    </Panel>
  )
}
