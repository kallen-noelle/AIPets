import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { findModuleByPath } from '../../modules/registry'
import { settingsEntries } from '../../settings/registry'

export function MigratingPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const module = findModuleByPath(location.pathname)
  const entry = settingsEntries.find(item => location.pathname.startsWith(item.path))

  const title = module
    ? t(module.titleKey, { defaultValue: module.id })
    : entry
      ? t(entry.titleKey, { defaultValue: entry.id })
      : t('settings.title', { defaultValue: 'Settings' })

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>

      <div className="flex flex-col gap-2 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-5">
        <p className="text-sm font-medium">
          {t('settings.reactShell.migrating', { defaultValue: 'This page is moving to React' })}
        </p>
        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.migratingDescription', {
            defaultValue: 'The Vue version still serves this page until its React port lands.',
          })}
        </p>
      </div>
    </section>
  )
}
