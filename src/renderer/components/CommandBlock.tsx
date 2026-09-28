import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Button } from './ui'
import './CommandBlock.css'

/** A copyable shell snippet — used for the udev and group fixes. */
export function CommandBlock({ command }: { command: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await window.openemeet.system.copyToClipboard(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="commandBlock">
      <pre className="commandBlock__code mono">{command}</pre>
      <Button variant="ghost" size="sm" className="commandBlock__copy" onClick={() => void copy()}>
        {copied ? t('diag.copied') : t('diag.copy')}
      </Button>
    </div>
  )
}
