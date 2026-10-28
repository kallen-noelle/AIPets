import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router'

import { settingsEntries } from '../../settings/registry'

const navItemClass = [
  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
  'text-[var(--airi-muted)] hover:bg-[var(--airi-hover)] hover:text-[var(--airi-fg)]',
].join(' ')

const navItemActiveClass = 'bg-[var(--airi-card)] text-[var(--airi-fg)]'

export function SettingsLayout() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-[var(--airi-bg)] text-[var(--airi-fg)]">
      <div className="mx-auto max-w-6xl w-full flex flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-[var(--airi-muted)] hover:text-[var(--airi-fg)]"
            >
              <span className="i-solar:alt-arrow-left-line-duotone" />
              {t('settings.reactShell.backToStage', { defaultValue: 'Back to stage' })}
            </Link>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {settingsEntries.map((entry) => {
              const label = t(entry.titleKey, { defaultValue: entry.id })

              return (
                <NavLink
                  key={entry.id}
                  to={entry.path}
                  className={({ isActive }) => `${navItemClass} ${isActive ? navItemActiveClass : ''}`}
                >
                  <span className={`${entry.icon} text-base`} />
                  <span className="whitespace-nowrap">{label}</span>
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
