import type { DirectorAutonomy } from '../../animation/director-config'

import { useTranslation } from 'react-i18next'

import {
  cueLimitFor,
  directorAutonomyKey,
  directorDefaults,
  directorMaxCuesKey,
  directorModelKey,
} from '../../animation/director-config'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

export function AnimationPage() {
  const { t } = useTranslation()
  // These defaults match the runtime, so the page never shows a different
  // state than the chat turn actually reads.
  const [model, setModel] = useStoredValue(directorModelKey, directorDefaults.model)
  const [autonomy, setAutonomy] = useStoredValue<DirectorAutonomy>(directorAutonomyKey, directorDefaults.autonomy)
  const [maxCues, setMaxCues] = useStoredValue(directorMaxCuesKey, directorDefaults.maxCues)

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.animation.title', { defaultValue: 'Animation director' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.pages.animation.description', {
            defaultValue: 'Let the chat model choose a bounded performance plan after each reply.',
          })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
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

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.animationDirectorAutonomy', { defaultValue: 'Autonomy level' })}</span>
          <select
            className={fieldClass}
            value={autonomy}
            onChange={event => setAutonomy(event.target.value as DirectorAutonomy)}
          >
            <option value="L1">L1 · Advisory cues</option>
            <option value="L2">L2 · Co-director</option>
            <option value="L3">L3 · Director</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.animationDirectorMaxCues', { defaultValue: 'Maximum cues per reply' })}</span>
          <input
            type="number"
            min={1}
            max={4}
            className={fieldClass}
            value={maxCues}
            onChange={(event) => {
              const next = Number(event.target.value)
              setMaxCues(Number.isFinite(next) ? Math.min(4, Math.max(1, Math.round(next))) : directorDefaults.maxCues)
            }}
          />
          <span className="text-xs text-[var(--airi-muted)]">
            {t('settings.reactShell.animationDirectorEffectiveCues', {
              defaultValue: 'Current level allows {{count}} cues.',
              count: cueLimitFor(autonomy, maxCues),
            })}
          </span>
        </label>

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.animationDirectorProviderHint', {
            defaultValue: 'Uses the active chat provider. A failed or timed-out director call never blocks the reply.',
          })}
        </p>
      </div>
    </section>
  )
}
