import type { ProviderDefinition } from '@proj-airi/provider-inference'

import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { createProvider, useProviders } from '../../providers/store'

const taskOrder = ['chat', 'vision', 'transcription', 'speech', 'embedding'] as const

function providerIcon(definition: ProviderDefinition): string {
  // Lobe icon packs are not installed in this app yet.
  if (!definition.icon || definition.icon.startsWith('i-lobe-icons'))
    return 'i-solar:cloud-bold-duotone'

  return definition.icon
}

export function ProvidersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const providers = useProviders()

  const translate = (key: string) => String(t(key, { defaultValue: key }))

  const groups = taskOrder
    .map(task => ({
      task,
      definitions: portableProviderDefinitions.filter(definition => definition.tasks.includes(task)),
    }))
    .filter(group => group.definitions.length > 0)

  const openProvider = (definitionId: string) => {
    const existing = Object.values(providers).find(provider => provider.definitionId === definitionId)
    const provider = existing ?? createProvider(definitionId)
    void navigate(`/settings/providers/${provider.id}`)
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.providers.title', { defaultValue: 'Providers' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.pages.providers.description', { defaultValue: '' })}
        </p>
      </header>

      {groups.map(group => (
        <div key={group.task} className="flex flex-col gap-3">
          <h2 className="text-xs text-[var(--airi-muted)] font-semibold tracking-wider uppercase">
            {group.task}
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.definitions.map((definition) => {
              const configuredCount = Object.values(providers)
                .filter(provider => provider.definitionId === definition.id)
                .length

              return (
                <button
                  key={definition.id}
                  type="button"
                  onClick={() => openProvider(definition.id)}
                  className={[
                    'flex items-start gap-3 rounded-2xl border border-[var(--airi-border)]',
                    'bg-[var(--airi-card)] p-4 text-left transition hover:bg-[var(--airi-hover)]',
                  ].join(' ')}
                >
                  <span className={`${providerIcon(definition)} mt-0.5 text-2xl`} />

                  <span className="min-w-0 flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{definition.nameLocalize({ t: translate })}</span>

                      {configuredCount > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                          {t('settings.reactShell.configured', { defaultValue: 'Configured' })}
                        </span>
                      )}
                    </span>

                    <span className="text-xs text-[var(--airi-muted)]">
                      {definition.descriptionLocalize({ t: translate })}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
