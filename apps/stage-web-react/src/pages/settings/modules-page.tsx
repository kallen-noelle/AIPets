import type { ModuleCategory } from '../../modules/registry'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { moduleCategories, modules } from '../../modules/registry'

function readConfiguredFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {}

  for (const module of modules) {
    if (!module.configuredFlag)
      continue

    flags[module.id] = module.configuredFlag.isConfigured(
      localStorage.getItem(module.configuredFlag.key),
    )
  }

  return flags
}

export function ModulesPage() {
  const { t } = useTranslation()
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [activeCategory, setActiveCategory] = useState<ModuleCategory>(moduleCategories[0])

  const refresh = useCallback(() => {
    setConfigured(readConfiguredFlags())
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const tabs = moduleCategories.map((category) => {
    const entries = modules.filter(module => module.category === category)
    return { category, entries }
  }).filter(tab => tab.entries.length > 0)

  const activeTab = tabs.find(tab => tab.category === activeCategory) ?? tabs[0]

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.modules.title', { defaultValue: 'Modules' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.pages.modules.description', { defaultValue: '' })}
        </p>
      </header>

      <div className="flex gap-2 border-b border-[var(--airi-border)]">
        {tabs.map(tab => (
          <button
            key={tab.category}
            type="button"
            onClick={() => setActiveCategory(tab.category)}
            className={[
              'px-3 py-2 text-xs font-semibold tracking-wider uppercase transition',
              tab.category === activeTab.category
                ? 'text-[var(--airi-fg)] border-b-2 border-[var(--airi-fg)]'
                : 'text-[var(--airi-muted)] hover:text-[var(--airi-fg)]',
            ].join(' ')}
          >
            {t(`settings.pages.modules.categories.${tab.category}`, { defaultValue: tab.category })}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {activeTab.entries.map((module) => {
          const isConfigured = configured[module.id]

          return (
            <Link
              key={module.id}
              to={module.path}
              className={[
                'flex items-start gap-3 rounded-2xl border border-[var(--airi-border)]',
                'bg-[var(--airi-card)] p-4 transition hover:bg-[var(--airi-hover)]',
              ].join(' ')}
            >
              <span className={`${module.icon} mt-0.5 text-2xl`} />

              <span className="min-w-0 flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {t(module.titleKey, { defaultValue: module.id })}
                  </span>

                  {isConfigured && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                      {t('settings.reactShell.configured', { defaultValue: 'Configured' })}
                    </span>
                  )}
                </span>

                <span className="text-xs text-[var(--airi-muted)]">
                  {t(module.descriptionKey, { defaultValue: '' })}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
