import { useTranslation } from 'react-i18next'

import {
  directorDefaults,
  directorModelKey,
} from '../../animation/director-config'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'rounded-xl border border-[var(--aipets-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--aipets-fg)]',
].join(' ')

export function AnimationPage() {
  const { t } = useTranslation()
  // The default matches the runtime, so the page never shows a different state
  // than the chat turn reads.
  const [model, setModel] = useStoredValue(directorModelKey, directorDefaults.model)

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.animation.title', { defaultValue: 'Animation director' })}
        </h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.pages.animation.description', {
            defaultValue: 'Let the chat model choose a performance plan after each reply.',
          })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.animationDirectorModel', { defaultValue: 'Director model' })}</span>
          <input
            className={fieldClass}
            value={model}
            placeholder={t('settings.reactShell.animationDirectorModelPlaceholder', {
              defaultValue: 'Leave empty to use the chat model',
            })}
            onChange={event => setModel(event.target.value)}
          />
        </label>

        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.animationDirectorProviderHint', {
            defaultValue: 'Uses the active chat provider. A failed or timed-out director call never blocks the reply.',
          })}
        </p>
      </div>
    </section>
  )
}
