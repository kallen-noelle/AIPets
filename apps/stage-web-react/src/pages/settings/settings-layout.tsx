import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router'

import { getDesktopBridge } from '../../desktop/bridge'
import { settingsEntries } from '../../settings/registry'

const navItemClass = [
  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
  'text-[var(--aipets-muted)] hover:bg-[var(--aipets-hover)] hover:text-[var(--aipets-fg)]',
].join(' ')

const navItemActiveClass = 'bg-[var(--aipets-card)] text-[var(--aipets-fg)]'

/**
 * The desktop window draws a native backplate. A translucent page background
 * lets the material show through. A browser tab keeps the solid background.
 */
const desktopShellClass = 'bg-[rgba(14,14,18,0.72)] backdrop-blur-xl'
const browserShellClass = 'bg-[var(--aipets-bg)]'

export function SettingsLayout() {
  const { t } = useTranslation()
  const desktop = Boolean(getDesktopBridge())

  return (
    <div className={['min-h-screen text-[var(--aipets-fg)]', desktop ? desktopShellClass : browserShellClass].join(' ')}>
      <div className="mx-auto max-w-6xl w-full flex flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="mb-4 flex items-center gap-2">
            <img src="/aipets-logo.svg" alt="" className="h-7 w-7" />
            <span className="text-sm font-medium">aipets</span>
          </div>

          <div className="mb-4 flex items-center justify-between gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-[var(--aipets-muted)] hover:text-[var(--aipets-fg)]"
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
