import { useTranslation } from 'react-i18next'

import { memoryEnabledKey, memoryWindowKey } from '../../chat/types'
import { PageHeader, SectionCard, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

export function MemoryShortTermPage() {
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
      <PageHeader
        title={t('settings.pages.modules.memory-short-term.title', { defaultValue: 'Short-Term Memory' })}
        description={t('settings.pages.modules.memory-short-term.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.reactShell.memoryEnabled', { defaultValue: 'Send conversation history' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.memoryWindow', { defaultValue: 'Messages to keep' })}</span>
          <input
            type="number"
            min={2}
            max={50}
            className="w-28 border border-[var(--aipets-border)] rounded-xl bg-transparent px-3 py-2 text-sm"
            value={windowSize}
            disabled={!enabled}
            onChange={event => changeWindow(event.target.value)}
          />
        </label>
      </SectionCard>
    </section>
  )
}
