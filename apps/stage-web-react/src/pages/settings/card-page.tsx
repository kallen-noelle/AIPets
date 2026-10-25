import { useTranslation } from 'react-i18next'

import { characterNameKey, characterPersonaKey } from '../../chat/types'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

export function CardPage() {
  const { t } = useTranslation()
  const [name, setName] = useStoredValue(characterNameKey, 'aipetdex')
  const [persona, setPersona] = useStoredValue(characterPersonaKey, '')

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

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
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
    </section>
  )
}
