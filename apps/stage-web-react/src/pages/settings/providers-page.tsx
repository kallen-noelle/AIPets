import type { ProviderDefinition } from '@proj-airi/provider-inference'

import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { createProvider, useProviders } from '../../providers/store'
import { definitionHasTask, providerTaskAliases } from '../../providers/tasks'

const taskGroups = (Object.keys(providerTaskAliases) as Array<keyof typeof providerTaskAliases>)
  .map(group => ({ id: group, label: group }))

// Claude has no standalone provider. The Anthropic card covers it.
const priorityProviderIds = [
  'alibaba-cloud-bailian',
  'deepseek',
  'anthropic',
  'openai',
  'byteplus',
  'alibaba-cloud-model-studio',
]

// The other cards stay in the registry but are hidden until they are ready.
const visibleProviderIds = new Set(priorityProviderIds)

function priorityIndex(id: string): number {
  const index = priorityProviderIds.indexOf(id)
  return index === -1 ? priorityProviderIds.length : index
}

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
  const [activeGroupId, setActiveGroupId] = useState(taskGroups[0].id)

  const translate = (key: string) => String(t(key, { defaultValue: key }))

  const groups = taskGroups
    .map(group => ({
      ...group,
      definitions: portableProviderDefinitions
        .filter(definition => visibleProviderIds.has(definition.id))
        .filter(definition => definitionHasTask(definition.tasks, group.id))
        .sort((left, right) => priorityIndex(left.id) - priorityIndex(right.id)),
    }))
    .filter(group => group.definitions.length > 0)

  const activeGroup = groups.find(group => group.id === activeGroupId) ?? groups[0]

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
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.pages.providers.description', { defaultValue: '' })}
        </p>
      </header>

      <div className="flex gap-2 border-b border-[var(--aipets-border)]">
        {groups.map(group => (
          <button
            key={group.id}
            type="button"
            onClick={() => setActiveGroupId(group.id)}
            className={[
              'px-3 py-2 text-xs font-semibold tracking-wider uppercase transition',
              group.id === activeGroup.id
                ? 'text-[var(--aipets-fg)] border-b-2 border-[var(--aipets-fg)]'
                : 'text-[var(--aipets-muted)] hover:text-[var(--aipets-fg)]',
            ].join(' ')}
          >
            {group.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {activeGroup.definitions.map((definition) => {
          const configuredCount = Object.values(providers)
            .filter(provider => provider.definitionId === definition.id)
            .length

          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => openProvider(definition.id)}
              className={[
                'flex items-start gap-3 rounded-2xl border border-[var(--aipets-border)]',
                'bg-[var(--aipets-card)] p-4 text-left transition hover:bg-[var(--aipets-hover)]',
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

                <span className="text-xs text-[var(--aipets-muted)]">
                  {definition.descriptionLocalize({ t: translate })}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
