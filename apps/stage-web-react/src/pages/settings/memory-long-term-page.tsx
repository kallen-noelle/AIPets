import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { characterNameKey } from '../../chat/types'
import { PageHeader, SectionCard, TextField, ToggleField } from '../../components/fields'
import {
  forgetMemory,
  makeGeneral,
  normalizeMemoryName,
  removeMemory,
  setMemoryEnabled,
  useMemoryState,
  writeMemory,
} from '../../memory/store'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

const smallButtonClass = [
  'shrink-0 text-xs text-[var(--airi-muted)] hover:text-[var(--airi-fg)]',
].join(' ')

const dangerButtonClass = [
  'shrink-0 text-xs text-[var(--airi-muted)] hover:text-rose-400',
].join(' ')

export function MemoryLongTermPage() {
  const { t } = useTranslation()
  const { enabled, entries } = useMemoryState()
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
        title={t('settings.pages.modules.memory-long-term.title', { defaultValue: 'Long-Term Memory' })}
        description={t('settings.reactShell.memoryLongTermDescription', {
          defaultValue: 'Memories the character keeps across chats. The index of this list is part of the prompt.',
        })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.memory-long-term.enable', { defaultValue: 'Use long-term memory' })}
          description={t('settings.pages.modules.memory-long-term.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setMemoryEnabled}
        />
      </SectionCard>

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
          className="self-start rounded-full bg-[var(--airi-fg)] px-4 py-1.5 text-xs text-[var(--airi-bg)] font-medium"
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
                      <span className="text-[10px] text-[var(--airi-muted)]">
                        {entry.persona ?? t('settings.reactShell.memoryGeneral', { defaultValue: 'General' })}
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
                            {t('settings.reactShell.memoryMakeGeneral', { defaultValue: 'Make general' })}
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
