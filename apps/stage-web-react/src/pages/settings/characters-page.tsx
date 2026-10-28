import type { BuiltinCharacter, CharacterAppearanceOverride } from '../../character/characters'

import { errorMessageFrom } from '@moeru/std'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  activeCharacterKey,
  characterAppearanceOverrideKey,
  characterEnabledKey,
  characterPreviewUrl,
  defaultCharacterAppearance,
  loadBuiltinCharacters,
} from '../../character/characters'
import { PageHeader, SectionCard, SliderField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

/**
 * Lists the characters shipped in `assets/characters.json`.
 *
 * The stage reads the active id and the appearance override from the same
 * storage keys, so a change here shows on the next stage render.
 */
export function CharactersPage() {
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeId, setActiveId] = useStoredValue(activeCharacterKey, '')
  const [enabled, setEnabled] = useStoredValue(characterEnabledKey, true)
  const [override, setOverride] = useStoredValue<CharacterAppearanceOverride>(
    characterAppearanceOverrideKey,
    {},
  )

  useEffect(() => {
    let cancelled = false
    loadBuiltinCharacters()
      .then((list) => {
        if (!cancelled)
          setCharacters(list)
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(errorMessageFrom(error) ?? 'Unknown error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const active = useMemo(
    () => characters.find(character => character.id === activeId) ?? null,
    [characters, activeId],
  )

  const appearance = { ...defaultCharacterAppearance, ...active?.appearance, ...override }

  const patchOverride = (patch: CharacterAppearanceOverride) => {
    setOverride({ ...override, ...patch })
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.characters.title', { defaultValue: 'Characters' })}
        description={t('settings.reactShell.charactersDescription', {
          defaultValue: 'Pick the character the stage shows and tune how it appears.',
        })}
      />

      <SectionCard
        title={t('settings.reactShell.characterStage', { defaultValue: 'Stage' })}
        description={t('settings.reactShell.characterStageDescription', {
          defaultValue: 'The stage hides the character when this switch is off.',
        })}
      >
        <ToggleField
          label={t('settings.reactShell.showCharacter', { defaultValue: 'Show character' })}
          checked={enabled}
          onChange={setEnabled}
        />
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.characterList', { defaultValue: 'Character list' })}
        description={t('settings.reactShell.characterListDescription', {
          defaultValue: 'Characters load from the generated asset index.',
        })}
      >
        {loadError && <p className="text-xs text-rose-400">{loadError}</p>}

        {!loadError && !characters.length && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.noCharacters', { defaultValue: 'No characters found.' })}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => {
            const preview = characterPreviewUrl(character)
            const isActive = character.id === activeId

            return (
              <button
                key={character.id}
                type="button"
                onClick={() => setActiveId(character.id)}
                className={[
                  'flex flex-col gap-2 rounded-2xl border p-3 text-left transition',
                  isActive
                    ? 'border-[var(--aipets-fg)] bg-[var(--aipets-hover)]'
                    : 'border-[var(--aipets-border)] hover:bg-[var(--aipets-hover)]',
                ].join(' ')}
              >
                {preview
                  ? <img src={preview} alt="" className="h-28 w-full rounded-xl bg-[var(--aipets-card)] object-contain" />
                  : <div className="h-28 w-full rounded-xl bg-[var(--aipets-card)]" />}
                <span className="text-sm font-medium">{character.name}</span>
                <span className="text-xs text-[var(--aipets-muted)]">
                  {character.role || character.id}
                  {' · '}
                  {t('settings.reactShell.clipCount', {
                    defaultValue: '{{count}} clips',
                    count: character.clipCount,
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </SectionCard>

      {active && (
        <SectionCard
          title={t('settings.reactShell.appearance', { defaultValue: 'Appearance' })}
          description={t('settings.reactShell.appearanceDescription', {
            defaultValue: 'These values override the look the character folder ships.',
          })}
        >
          <SliderField
            label={t('settings.reactShell.scale', { defaultValue: 'Scale' })}
            value={appearance.scale}
            min={0.4}
            max={2}
            step={0.05}
            onChange={scale => patchOverride({ scale })}
          />
          <SliderField
            label={t('settings.reactShell.offsetX', { defaultValue: 'Horizontal offset' })}
            value={appearance.offsetX}
            min={-50}
            max={50}
            step={1}
            onChange={offsetX => patchOverride({ offsetX })}
          />
          <SliderField
            label={t('settings.reactShell.offsetY', { defaultValue: 'Vertical offset' })}
            value={appearance.offsetY}
            min={-50}
            max={50}
            step={1}
            onChange={offsetY => patchOverride({ offsetY })}
          />
          <SliderField
            label={t('settings.reactShell.fade', { defaultValue: 'Fade (ms)' })}
            value={appearance.fadeMs}
            min={0}
            max={1200}
            step={20}
            onChange={fadeMs => patchOverride({ fadeMs })}
          />
          <ToggleField
            label={t('settings.reactShell.mirror', { defaultValue: 'Mirror' })}
            checked={appearance.mirror}
            onChange={mirror => patchOverride({ mirror })}
          />
          <ToggleField
            label={t('settings.reactShell.clickEnabled', { defaultValue: 'React to clicks' })}
            checked={appearance.clickEnabled}
            onChange={clickEnabled => patchOverride({ clickEnabled })}
          />

          <button
            type="button"
            className="self-start text-xs text-[var(--aipets-muted)] hover:text-rose-400"
            onClick={() => setOverride({})}
          >
            {t('settings.reactShell.resetAppearance', { defaultValue: 'Reset appearance' })}
          </button>
        </SectionCard>
      )}
    </section>
  )
}
