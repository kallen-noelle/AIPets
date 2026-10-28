import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

/** Device-level wake words. The Vue card store keeps per-card words under its own keys. */
const enabledKey = 'aipets:react:voice/wake-words-enabled'
const wordsKey = 'aipets:react:voice/wake-words'

const removeClass = 'shrink-0 text-xs text-[var(--aipets-muted)] hover:text-rose-400'

/**
 * Wake words that the device voice pipeline reads.
 *
 * The stage does not listen for these phrases yet. It stores them so the
 * desktop audio pipeline can use them without a second settings surface.
 */
export function WakeWordsPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [words, setWords] = useStoredValue<string[]>(wordsKey, [])
  const [draft, setDraft] = useState('')

  const add = () => {
    const next = draft.trim()
    if (!next || words.some(word => word.toLowerCase() === next.toLowerCase()))
      return

    setWords([...words, next])
    setDraft('')
  }

  const remove = (word: string) => {
    setWords(words.filter(existing => existing !== word))
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.hearing.wake-words.title', { defaultValue: 'Wake words' })}
        description={t('settings.pages.modules.hearing.wake-words.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.reactShell.wakeWordsEnabled', { defaultValue: 'Listen for wake words' })}
          description={t('settings.reactShell.wakeWordsEnabledDescription', {
            defaultValue: 'The device voice pipeline starts listening for these phrases.',
          })}
          checked={enabled}
          onChange={setEnabled}
        />
      </SectionCard>

      <SectionCard title={t('settings.reactShell.wakeWordsList', { defaultValue: 'Phrases' })}>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex flex-1 flex-col gap-1 text-sm">
            <span>{t('settings.reactShell.wakeWordsPhrase', { defaultValue: 'Phrase' })}</span>
            <input
              className="w-full border border-[var(--aipets-border)] rounded-xl bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--aipets-fg)]"
              value={draft}
              placeholder={t('settings.reactShell.wakeWordsPhrasePlaceholder', { defaultValue: 'Hey aipets' })}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  add()
              }}
            />
          </label>

          <button
            type="button"
            onClick={add}
            className="rounded-full bg-[var(--aipets-fg)] px-4 py-2 text-xs text-[var(--aipets-bg)] font-medium"
          >
            {t('settings.reactShell.wakeWordsAdd', { defaultValue: 'Add' })}
          </button>
        </div>

        {words.length === 0
          ? (
              <p className="text-xs text-[var(--aipets-muted)]">
                {t('settings.reactShell.wakeWordsEmpty', { defaultValue: 'No wake words saved yet.' })}
              </p>
            )
          : (
              <ul className="flex flex-col gap-2">
                {words.map(word => (
                  <li
                    key={word}
                    className="flex items-center justify-between gap-3 border border-[var(--aipets-border)] rounded-xl px-3 py-2"
                  >
                    <span className="text-sm">{word}</span>
                    <button
                      type="button"
                      className={removeClass}
                      onClick={() => remove(word)}
                    >
                      {t('settings.reactShell.deleteEntry', { defaultValue: 'Delete' })}
                    </button>
                  </li>
                ))}
              </ul>
            )}

        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.wakeWordsRuntimeNote', {
            defaultValue: 'The React stage does not listen for these phrases yet. Speech input starts from the microphone button in chat.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
