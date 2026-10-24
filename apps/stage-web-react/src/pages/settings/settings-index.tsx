import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { settingsEntries } from '../../settings/registry'

export function SettingsIndex() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('settings.title', { defaultValue: 'Settings' })}</h1>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {settingsEntries.map((entry) => {
          const ready = entry.status === 'ready'

          return (
            <Link
              key={entry.id}
              to={entry.path}
              className={[
                'group flex items-start gap-3 rounded-2xl border border-[var(--airi-border)]',
                'bg-[var(--airi-card)] p-4 transition hover:bg-[var(--airi-hover)]',
              ].join(' ')}
            >
              <span className={`${entry.icon} mt-0.5 text-2xl text-[var(--airi-fg)]`} />

              <span className="min-w-0 flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{t(entry.titleKey, { defaultValue: entry.id })}</span>
                  {!ready && (
                    <span className="rounded-full bg-[var(--airi-hover)] px-2 py-0.5 text-[10px] text-[var(--airi-muted)]">
                      {t('settings.reactShell.planned', { defaultValue: 'Planned' })}
                    </span>
                  )}
                </span>

                {entry.descriptionKey && (
                  <span className="text-xs text-[var(--airi-muted)]">
                    {t(entry.descriptionKey, { defaultValue: '' })}
                  </span>
                )}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
