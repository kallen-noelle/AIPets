import en from '@proj-aipets/i18n/locales/en'
import zhHans from '@proj-aipets/i18n/locales/zh-Hans'
import i18n from 'i18next'

import { initReactI18next } from 'react-i18next'

export const supportedLanguages = ['en', 'zh-Hans'] as const
export type SupportedLanguage = typeof supportedLanguages[number]

export const languageStorageKey = 'aipets:react:language'

/**
 * The shared locale files use Vue i18n syntax with single braces.
 * i18next expects double braces, so each interpolated name gets wrapped.
 */
function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(/\{(\w+)\}/g, '{{$1}}')

  if (Array.isArray(value))
    return value.map(normalizeValue)

  if (value && typeof value === 'object')
    return normalizeMessages(value as Record<string, unknown>)

  return value
}

function normalizeMessages(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, normalizeValue(value)]),
  )
}

export function resolveInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(languageStorageKey)
  if (stored === 'en' || stored === 'zh-Hans')
    return stored

  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    'en': { translation: normalizeMessages(en as Record<string, unknown>) },
    'zh-Hans': { translation: normalizeMessages(zhHans as Record<string, unknown>) },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
