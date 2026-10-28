import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PageHeader, SectionCard, ToggleField } from '../../components/fields'
import { setMemoryEnabled, useMemoryState } from '../../memory/store'

const subpageClass = [
  'rounded-full border border-[var(--aipets-border)] px-4 py-2 text-sm',
  'hover:bg-[var(--aipets-hover)]',
].join(' ')

/** The switch that controls long-term memory, and the two pages that manage it. */
export function MemoryLongTermPage() {
  const { t } = useTranslation()
  const { enabled } = useMemoryState()

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

      <div className="flex flex-wrap gap-3">
        <Link to="/settings/modules/memory-long-term/memories" className={subpageClass}>
          {t('settings.pages.modules.memory-long-term.memories.title', { defaultValue: 'Memories' })}
        </Link>
        <Link to="/settings/modules/memory-long-term/recipes" className={subpageClass}>
          {t('settings.pages.modules.memory-long-term.recipes.title', { defaultValue: 'Recipes' })}
        </Link>
      </div>
    </section>
  )
}
