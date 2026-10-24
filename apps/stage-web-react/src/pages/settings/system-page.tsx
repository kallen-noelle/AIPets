import { useTranslation } from 'react-i18next'

import { setLanguage, setTheme, usePreferences } from '../../settings/preferences'

const optionClass = [
  'rounded-xl border border-[var(--airi-border)] px-4 py-2 text-sm transition',
  'hover:bg-[var(--airi-hover)]',
].join(' ')

const optionActiveClass = 'border-[var(--airi-fg)] bg-[var(--airi-hover)] font-semibold'

export function SystemPage() {
  const { t } = useTranslation()
  const preferences = usePreferences()

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('settings.pages.system.title', { defaultValue: 'System' })}</h1>
      </header>

      <div className="flex flex-col gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <h2 className="text-sm font-semibold">{t('settings.reactShell.language', { defaultValue: 'Language' })}</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${optionClass}  ${preferences.language === 'en' ? optionActiveClass : ''}`}
            onClick={() => setLanguage('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`${optionClass}  ${preferences.language === 'zh-Hans' ? optionActiveClass : ''}`}
            onClick={() => setLanguage('zh-Hans')}
          >
            简体中文
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <h2 className="text-sm font-semibold">{t('settings.reactShell.theme', { defaultValue: 'Theme' })}</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${optionClass}  ${preferences.theme === 'dark' ? optionActiveClass : ''}`}
            onClick={() => setTheme('dark')}
          >
            {t('settings.reactShell.themeDark', { defaultValue: 'Dark' })}
          </button>
          <button
            type="button"
            className={`${optionClass}  ${preferences.theme === 'light' ? optionActiveClass : ''}`}
            onClick={() => setTheme('light')}
          >
            {t('settings.reactShell.themeLight', { defaultValue: 'Light' })}
          </button>
        </div>
      </div>
    </section>
  )
}
