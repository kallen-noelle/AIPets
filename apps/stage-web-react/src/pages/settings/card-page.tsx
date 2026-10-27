import type { CharacterAppearanceOverride } from '../../character/characters'

import { useTranslation } from 'react-i18next'

import { characterAppearanceOverrideKey, characterEnabledKey, defaultCharacterAppearance } from '../../character/characters'
import { characterNameKey, characterPersonaKey, chatModelKey, memoryWindowKey } from '../../chat/types'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

const sectionClass = [
  'flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl',
  'bg-[var(--airi-card)] p-4',
].join(' ')

const legendClass = 'text-xs font-medium tracking-[0.2em] uppercase text-[var(--airi-muted)]'
const hintClass = 'text-xs text-[var(--airi-muted)]'
const pairClass = 'grid gap-4 sm:grid-cols-2'
const sliderClass = 'w-full accent-[var(--airi-fg)]'

/**
 * Character settings.
 *
 * One grouped form edits the character the stage renders. Every field writes
 * to storage on change, so the stage and the chat pick the values up without a
 * save step. Appearance fields override the values a character folder ships.
 */
export function CardPage() {
  const { t } = useTranslation()
  const [name, setName] = useStoredValue(characterNameKey, 'aipetdex')
  const [persona, setPersona] = useStoredValue(characterPersonaKey, '')
  const [enabled, setEnabled] = useStoredValue(characterEnabledKey, true)
  const [appearance, setAppearance] = useStoredValue<CharacterAppearanceOverride>(
    characterAppearanceOverrideKey,
    {},
  )
  const [model, setModel] = useStoredValue(chatModelKey, '')
  const [historyTurns, setHistoryTurns] = useStoredValue(memoryWindowKey, 10)

  const scale = appearance.scale ?? defaultCharacterAppearance.scale
  const offsetX = appearance.offsetX ?? defaultCharacterAppearance.offsetX
  const offsetY = appearance.offsetY ?? defaultCharacterAppearance.offsetY
  const fadeMs = appearance.fadeMs ?? defaultCharacterAppearance.fadeMs
  const mirror = appearance.mirror ?? defaultCharacterAppearance.mirror
  const clickEnabled = appearance.clickEnabled ?? defaultCharacterAppearance.clickEnabled

  const patchAppearance = (patch: CharacterAppearanceOverride) => {
    setAppearance({ ...appearance, ...patch })
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.card.title', { defaultValue: 'Card' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.cardDescription', {
            defaultValue: 'The name and persona the assistant uses in chat.',
          })}
        </p>
      </header>

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

      <div className={sectionClass}>
        <p className={legendClass}>
          {t('settings.reactShell.cardSectionAppearance', { defaultValue: 'Appearance' })}
        </p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center justify-between">
            <span>{t('settings.reactShell.characterScale', { defaultValue: 'Scale' })}</span>
            <span className={hintClass}>{`${scale.toFixed(2)}x`}</span>
          </span>
          <input
            type="range"
            className={sliderClass}
            min={0.5}
            max={2}
            step={0.05}
            value={scale}
            onChange={event => patchAppearance({ scale: Number(event.target.value) })}
          />
        </label>

        <div className={pairClass}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between">
              <span>{t('settings.reactShell.characterOffsetX', { defaultValue: 'Horizontal offset' })}</span>
              <span className={hintClass}>{`${offsetX}%`}</span>
            </span>
            <input
              type="range"
              className={sliderClass}
              min={-50}
              max={50}
              step={1}
              value={offsetX}
              onChange={event => patchAppearance({ offsetX: Number(event.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between">
              <span>{t('settings.reactShell.characterOffsetY', { defaultValue: 'Vertical offset' })}</span>
              <span className={hintClass}>{`${offsetY}%`}</span>
            </span>
            <input
              type="range"
              className={sliderClass}
              min={-50}
              max={50}
              step={1}
              value={offsetY}
              onChange={event => patchAppearance({ offsetY: Number(event.target.value) })}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center justify-between">
            <span>{t('settings.reactShell.characterFade', { defaultValue: 'Fade in' })}</span>
            <span className={hintClass}>{`${fadeMs}ms`}</span>
          </span>
          <input
            type="range"
            className={sliderClass}
            min={0}
            max={1000}
            step={20}
            value={fadeMs}
            onChange={event => patchAppearance({ fadeMs: Number(event.target.value) })}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mirror}
            onChange={event => patchAppearance({ mirror: event.target.checked })}
          />
          {t('settings.reactShell.characterMirror', { defaultValue: 'Mirror the character' })}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={clickEnabled}
            onChange={event => patchAppearance({ clickEnabled: event.target.checked })}
          />
          {t('settings.reactShell.characterClick', { defaultValue: 'React to clicks' })}
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className={hintClass}>
            {t('settings.reactShell.characterAppearanceHint', {
              defaultValue: 'Empty fields follow the look the character folder ships.',
            })}
          </p>
          <button
            type="button"
            className="text-xs text-[var(--airi-muted)] underline-offset-2 transition hover:text-[var(--airi-fg)] hover:underline"
            onClick={() => setAppearance({})}
          >
            {t('settings.reactShell.characterAppearanceReset', { defaultValue: 'Reset' })}
          </button>
        </div>
      </div>

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

      <div className={sectionClass}>
        <p className={legendClass}>
          {t('settings.reactShell.cardSectionStage', { defaultValue: 'Stage' })}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={event => setEnabled(event.target.checked)}
          />
          {t('settings.reactShell.characterShowOnStage', { defaultValue: 'Show the character on the stage' })}
        </label>
        <p className={hintClass}>
          {t('settings.reactShell.characterShowOnStageHint', {
            defaultValue: 'A hidden character keeps its chat and settings, and the stage shows a placeholder.',
          })}
        </p>
      </div>
    </section>
  )
}
