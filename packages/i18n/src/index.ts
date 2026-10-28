export const all = {
  'en': 'English',
  'zh-Hans': '简体中文',
}

export const localeRemap: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-Hans': 'zh-Hans',
  'en': 'en',
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
}

export function resolveSupportedLocale(
  locale: string | null | undefined,
  supportedLocales: readonly string[],
  fallbackLocale = 'en',
): string {
  const normalizedLocale = localeRemap[locale ?? fallbackLocale] ?? locale ?? fallbackLocale

  return supportedLocales.includes(normalizedLocale)
    ? normalizedLocale
    : fallbackLocale
}

export { createFallbackOptions } from './fallback'
export { serializeStartupFallbackLocales } from './startup-fallback'
