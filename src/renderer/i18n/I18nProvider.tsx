import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { translator, type Locale, type TranslationKey } from '@shared/i18n'

interface I18nValue {
  locale: Locale
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nValue>({ locale: 'en', t: translator('en') })

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({ locale, t: translator(locale) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}

/** Formats a number using the active locale, for readouts and durations. */
export function useNumberFormat() {
  const { locale } = useI18n()
  return useMemo(() => new Intl.NumberFormat(locale), [locale])
}
