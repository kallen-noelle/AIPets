import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, ToggleField } from '../../components/fields'
import { readStored, useStoredValue, writeStored } from '../../settings/persisted'

interface MemoryEntry {
  name: string
  description: string
  body: string
  persona?: string
  updatedAt?: number
}

const enabledKey = 'memory/enabled'
const entriesKey = 'memory/entries'

export function MemoryLongTermPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, true)
  const [entries, setEntries] = useStoredValue<MemoryEntry[]>(entriesKey, [])

  const remove = (entry: MemoryEntry) => {
    const next = readStored<MemoryEntry[]>(entriesKey, []).filter(
      item => item.name !== entry.name || item.persona !== entry.persona,
    )
    writeStored(entriesKey, next)
    setEntries(next)
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.memory-long-term.title', { defaultValue: 'Long-Term Memory' })}
        description={t('settings.pages.modules.memory-long-term.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.memory-long-term.enable', { defaultValue: 'Use long-term memory' })}
          description={t('settings.pages.modules.memory-long-term.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.memoryEntries', { defaultValue: 'Stored memories' })}
        description={t('settings.reactShell.memoryRecipesNote', {
          defaultValue: 'Memory recipes are not part of the React app yet.',
        })}
      >
        {entries.length === 0
          ? (
              <p className="text-xs text-[var(--airi-muted)]">
                {t('settings.reactShell.memoryEntriesEmpty', { defaultValue: 'No memories stored yet.' })}
              </p>
            )
          : (
              <ul className="flex flex-col gap-2">
                {entries.map(entry => (
                  <li
                    key={`${entry.persona ?? ''}::${entry.name}`}
                    className="flex items-start justify-between gap-3 border border-[var(--airi-border)] rounded-xl p-3"
                  >
                    <div className="min-w-0 flex flex-col gap-1">
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span className="text-xs text-[var(--airi-muted)]">{entry.description}</span>
                      {entry.persona && (
                        <span className="text-[10px] text-[var(--airi-muted)]">{entry.persona}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="shrink-0 text-xs text-[var(--airi-muted)] hover:text-rose-400"
                      onClick={() => remove(entry)}
                    >
                      {t('settings.reactShell.deleteEntry', { defaultValue: 'Delete' })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </SectionCard>
    </section>
  )
}
