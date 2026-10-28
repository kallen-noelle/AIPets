import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { characterNameKey } from '../../chat/types'
import { PageHeader, SectionCard, TextField } from '../../components/fields'
import {
  forgetMemory,
  makeGeneral,
  normalizeMemoryName,
  removeMemory,
  useMemoryState,
  writeMemory,
} from '../../memory/store'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--aipets-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--aipets-fg)]',
].join(' ')

const smallButtonClass = [
  'shrink-0 text-xs text-[var(--aipets-muted)] hover:text-[var(--aipets-fg)]',
].join(' ')

const dangerButtonClass = [
  'shrink-0 text-xs text-[var(--aipets-muted)] hover:text-rose-400',
].join(' ')

/**
 * The stored memories of every character, and the general ones.
 *
 * The key matches the Vue memory store, so both apps read one list.
 */
export function MemoryEntriesPage() {
  const { t } = useTranslation()
  const { entries } = useMemoryState()
  const [characterName] = useStoredValue(characterNameKey, 'aipetdex')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const add = () => {
    if (!normalizeMemoryName(name) || !body.trim()) {
      setFormError(t('settings.reactShell.memoryFormIncomplete', {
        defaultValue: 'A memory needs a name and a body.',
      }))
      return
    }

    writeMemory({ name, description, body }, characterName)
    setFormError(null)
    setName('')
    setDescription('')
    setBody('')
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.memory-long-term.memories.title', { defaultValue: 'Memories' })}
        description={t('settings.pages.modules.memory-long-term.memories.description', { defaultValue: '' })}
      />

      <SectionCard
        title={t('settings.reactShell.memoryAdd', { defaultValue: 'Add a memory' })}
        description={t('settings.reactShell.memoryAddDescription', {
          defaultValue: 'The character reads these entries when they matter. It can also save and forget its own entries.',
        })}
      >
        <TextField
          label={t('settings.reactShell.memoryName', { defaultValue: 'Name' })}
          value={name}
          placeholder="favorite-tea"
          onChange={setName}
        />
        <TextField
          label={t('settings.reactShell.memoryIndexLine', { defaultValue: 'Index line' })}
          description={t('settings.reactShell.memoryIndexLineHint', {
            defaultValue: 'The fact itself, or when the fact matters.',
          })}
          value={description}
          onChange={setDescription}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.memoryBody', { defaultValue: 'Body' })}</span>
          <textarea
            className={`${fieldClass} min-h-24`}
            value={body}
            onChange={event => setBody(event.target.value)}
          />
        </label>

        {formError && <p className="text-xs text-rose-400">{formError}</p>}

        <button
          type="button"
          onClick={add}
          className="self-start rounded-full bg-[var(--aipets-fg)] px-4 py-1.5 text-xs text-[var(--aipets-bg)] font-medium"
        >
          {t('settings.reactShell.memoryAddButton', { defaultValue: 'Save memory' })}
        </button>
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.memoryEntries', { defaultValue: 'Stored memories' })}
        description={t('settings.reactShell.memoryEntriesDescription', {
          defaultValue: 'An entry owned by a character stays with it. A general entry reaches every character.',
        })}
      >
        {entries.length === 0
          ? (
              <p className="text-xs text-[var(--aipets-muted)]">
                {t('settings.pages.modules.memory-long-term.memories.empty', { defaultValue: 'No memories yet.' })}
              </p>
            )
          : (
              <ul className="flex flex-col gap-2">
                {entries.map(entry => (
                  <li
                    key={`${entry.persona ?? ''}::${entry.name}`}
                    className="flex items-start justify-between gap-3 border border-[var(--aipets-border)] rounded-xl p-3"
                  >
                    <div className="min-w-0 flex flex-col gap-1">
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span className="text-xs text-[var(--aipets-muted)]">{entry.description}</span>
                      <span className="text-[10px] text-[var(--aipets-muted)]">
                        {entry.persona
                          ?? t('settings.pages.modules.memory-long-term.memories.general', {
                            defaultValue: 'Shared secrets',
                          })}
                      </span>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {entry.persona && (
                        <>
                          <button
                            type="button"
                            className={smallButtonClass}
                            onClick={() => makeGeneral(entry.name, entry.persona!)}
                          >
                            {t('settings.pages.modules.memory-long-term.memories.make_general', {
                              defaultValue: 'Share {{name}} with every character',
                              name: entry.name,
                            })}
                          </button>
                          <button
                            type="button"
                            className={dangerButtonClass}
                            onClick={() => forgetMemory(entry.name, entry.persona!)}
                          >
                            {t('settings.reactShell.deleteEntry', { defaultValue: 'Delete' })}
                          </button>
                        </>
                      )}
                      {!entry.persona && (
                        <button
                          type="button"
                          className={dangerButtonClass}
                          onClick={() => removeMemory(entry)}
                        >
                          {t('settings.reactShell.deleteEntry', { defaultValue: 'Delete' })}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
      </SectionCard>
    </section>
  )
}
