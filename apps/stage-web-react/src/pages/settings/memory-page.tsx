import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { memoryEnabledKey, memoryWindowKey } from '../../chat/types'
import { useStoredValue } from '../../settings/persisted'

export function MemoryPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(memoryEnabledKey, true)
  const [windowSize, setWindowSize] = useStoredValue(memoryWindowKey, 10)

  const changeWindow = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isNaN(parsed))
      setWindowSize(Math.min(50, Math.max(2, parsed)))
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.memory.title', { defaultValue: 'Memory' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.memoryDescription', {
            defaultValue: 'Controls how much conversation history the model receives.',
          })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>{t('settings.reactShell.memoryEnabled', { defaultValue: 'Send conversation history' })}</span>
          <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.memoryWindow', { defaultValue: 'Messages to keep' })}</span>
          <input
            type="number"
            min={2}
            max={50}
            className="w-28 border border-[var(--airi-border)] rounded-xl bg-transparent px-3 py-2 text-sm"
            value={windowSize}
            disabled={!enabled}
            onChange={event => changeWindow(event.target.value)}
          />
        </label>

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.memoryLongTermNote', {
            defaultValue: 'Long-term memory lives on its own page and reaches this chat as an index in the prompt.',
          })}
        </p>
      </div>

      <Link
        to="/settings/modules/memory-long-term"
        className="text-sm text-[var(--airi-muted)] hover:text-[var(--airi-fg)]"
      >
        {t('settings.pages.modules.memory-long-term.title', { defaultValue: 'Long-Term Memory' })}
      </Link>
    </section>
  )
}
