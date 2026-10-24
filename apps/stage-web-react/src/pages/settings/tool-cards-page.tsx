import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const enabledKey = 'settings/tool-cards/enabled'
const replyCardsKey = 'settings/tool-cards/reply-cards'

export function ToolCardsPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, true)
  const [replyCardsEnabled, setReplyCardsEnabled] = useStoredValue(replyCardsKey, true)

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.tool-cards.title', { defaultValue: 'Tool cards' })}
        description={t('settings.pages.modules.tool-cards.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.tool-cards.enable', { defaultValue: 'Make cards for tool results' })}
          description={t('settings.pages.modules.tool-cards.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <ToggleField
          label={t('settings.pages.modules.tool-cards.reply-cards', { defaultValue: 'Draw cards in replies' })}
          description={t('settings.pages.modules.tool-cards.reply-cards-description', { defaultValue: '' })}
          checked={replyCardsEnabled}
          onChange={setReplyCardsEnabled}
        />

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.notInChat', {
            defaultValue: 'The value is saved now. The React chat does not call this tool yet.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
