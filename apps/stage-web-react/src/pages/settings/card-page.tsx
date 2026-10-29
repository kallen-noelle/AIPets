import type { BuiltinCharacter } from '../../character/characters'
import type { CharacterInstance, NumberedInstance } from '../../character/instances'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  applyCharacterPersona,
  characterSettingKey,
  loadBuiltinCharacters,
  loadCharacterPersona,
} from '../../character/characters'
import {
  instanceScopedKey,
  instancesOfCharacter,
  useCharacterInstances,
} from '../../character/instances'
import { chatModelKey, memoryWindowKey } from '../../chat/types'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--aipets-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--aipets-fg)]',
].join(' ')

const sectionClass = [
  'flex flex-col gap-4 border border-[var(--aipets-border)] rounded-2xl',
  'bg-[var(--aipets-card)] p-4',
].join(' ')

const legendClass = 'text-xs font-medium tracking-[0.2em] uppercase text-[var(--aipets-muted)]'
const hintClass = 'text-xs text-[var(--aipets-muted)]'

const numberButtonClass = [
  'h-7 min-w-7 rounded-full border px-2 text-xs transition',
  'border-[var(--aipets-border)] hover:bg-[var(--aipets-hover)]',
].join(' ')
const numberButtonActiveClass = [
  'h-7 min-w-7 rounded-full border px-2 text-xs transition',
  'border-[var(--aipets-fg)] bg-[var(--aipets-fg)] text-[var(--aipets-bg)]',
].join(' ')

/** Chat settings of one instance. Another instance keeps another value. */
function InstanceChatSettings({ instance }: { instance: CharacterInstance }) {
  const { t } = useTranslation()
  const [model, setModel] = useStoredValue(instanceScopedKey(chatModelKey, instance.id), '')
  const [historyTurns, setHistoryTurns] = useStoredValue(instanceScopedKey(memoryWindowKey, instance.id), 10)

  return (
    <div className={sectionClass}>
      <p className={legendClass}>
        {t('settings.reactShell.cardSectionChat', { defaultValue: 'Chat' })}
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span>{t('settings.reactShell.characterChatModel', { defaultValue: 'Chat model' })}</span>
        <input
          className={fieldClass}
          value={model}
          placeholder={t('settings.reactShell.characterChatModelPlaceholder', {
            defaultValue: 'For example gpt-4o-mini',
          })}
          onChange={event => setModel(event.target.value)}
        />
        <span className={hintClass}>
          {t('settings.reactShell.characterChatModelHint', {
            defaultValue: 'The provider comes from the Providers page. An empty value uses its default model.',
          })}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>{t('settings.reactShell.characterHistoryTurns', { defaultValue: 'History rounds' })}</span>
        <input
          type="number"
          className={fieldClass}
          min={2}
          max={50}
          step={1}
          value={historyTurns}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next))
              setHistoryTurns(Math.min(50, Math.max(2, Math.floor(next))))
          }}
        />
        <span className={hintClass}>
          {t('settings.reactShell.characterHistoryTurnsHint', {
            defaultValue: 'Rounds the model keeps in context. The minimum is 2.',
          })}
        </span>
      </label>
    </div>
  )
}

/** One form for one character. Every instance of the character shares the name and the persona. */
function CharacterForm({ character, numbered, selectedId, onSelect }: {
  character: BuiltinCharacter
  numbered: NumberedInstance[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useStoredValue(characterSettingKey(character.id, 'name'), character.name)
  const [persona, setPersona] = useStoredValue(characterSettingKey(character.id, 'persona'), '')
  const [instances, setInstances] = useCharacterInstances()
  const current = numbered.find(entry => entry.instance.id === selectedId)?.instance ?? null
  const enabled = current?.enabled ?? false

  const toggleEnabled = (next: boolean) => {
    if (!current)
      return

    setInstances(instances.map(entry => entry.id === current.id ? { ...entry, enabled: next } : entry))

    if (!next || persona)
      return

    // The persona file of the pack fills an empty persona once.
    void loadCharacterPersona(character)
      .then((loaded) => {
        if (loaded)
          applyCharacterPersona(character.id, loaded)
      })
      .catch(() => undefined)
  }

  return (
    <>
      <div className={sectionClass}>
        <p className={legendClass}>
          {t('settings.reactShell.cardSectionCharacter', { defaultValue: 'Character' })}
        </p>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.characterName', { defaultValue: 'Name' })}</span>
          <input className={fieldClass} value={name} onChange={event => setName(event.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.characterPersona', { defaultValue: 'Persona' })}</span>
          <textarea
            className={`${fieldClass} min-h-40 resize-y`}
            value={persona}
            placeholder={t('settings.reactShell.characterPersonaPlaceholder', {
              defaultValue: 'Describe how the character speaks and behaves.',
            })}
            onChange={event => setPersona(event.target.value)}
          />
        </label>
      </div>

      {numbered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {numbered.map(({ instance, number }) => (
            <button
              key={instance.id}
              type="button"
              className={instance.id === selectedId ? numberButtonActiveClass : numberButtonClass}
              onClick={() => onSelect(instance.id)}
            >
              {number}
            </button>
          ))}
          <span className={hintClass}>
            {t('settings.reactShell.instancePickHint', {
              defaultValue: 'Pick an instance to edit its chat settings.',
            })}
          </span>
        </div>
      )}

      {current && <InstanceChatSettings key={current.id} instance={current} />}

      <div className={sectionClass}>
        <p className={legendClass}>
          {t('settings.reactShell.cardSectionStage', { defaultValue: 'Stage' })}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={!current}
            checked={enabled}
            onChange={event => toggleEnabled(event.target.checked)}
          />
          {t('settings.reactShell.instanceShowOnStage', { defaultValue: 'Show this instance on the stage' })}
        </label>
        <p className={hintClass}>
          {t('settings.reactShell.instanceShowOnStageHint', {
            defaultValue: 'Several instances can be on at once. A disabled instance keeps its chat, memory, and settings.',
          })}
        </p>
      </div>
    </>
  )
}

/**
 * Character settings.
 *
 * The switcher picks the character to edit. Every field writes to storage on
 * change, so the stage and the chat pick the values up without a save step.
 * All instances of one character share the name and the persona. The chat
 * model and the history limit stay with the instance. The look of a pet is set
 * on the Models page, one instance at a time.
 */
export function CardPage() {
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<Record<string, string>>({})
  const [instances] = useCharacterInstances()

  useEffect(() => {
    let disposed = false

    void loadBuiltinCharacters()
      .then((next) => {
        if (disposed)
          return

        setCharacters(next)
        setSelectedId(current => current ?? next[0]?.id ?? null)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
    }
  }, [])

  const selected = characters.find(character => character.id === selectedId) ?? null
  const numbered = selected ? instancesOfCharacter(instances, selected.id) : []
  const currentInstanceId = selected
    ? selectedInstance[selected.id] ?? numbered[0]?.instance.id ?? null
    : null

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.card.title', { defaultValue: 'Card' })}
        </h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.reactShell.cardDescription', {
            defaultValue: 'The name and persona the assistant uses in chat.',
          })}
        </p>
      </header>

      {characters.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {characters.map((character) => {
            const active = character.id === selectedId

            return (
              <button
                key={character.id}
                type="button"
                className={[
                  'rounded-full border px-4 py-1.5 text-xs transition',
                  active
                    ? 'bg-[var(--aipets-card)]'
                    : 'border-[var(--aipets-border)] bg-[var(--aipets-card)] hover:bg-[var(--aipets-hover)]',
                ].join(' ')}
                style={active ? { borderColor: character.accent, color: character.accent } : undefined}
                onClick={() => setSelectedId(character.id)}
              >
                {character.name}
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <CharacterForm
          key={selected.id}
          character={selected}
          numbered={numbered}
          selectedId={currentInstanceId}
          onSelect={id => setSelectedInstance({ ...selectedInstance, [selected.id]: id })}
        />
      )}
    </section>
  )
}
