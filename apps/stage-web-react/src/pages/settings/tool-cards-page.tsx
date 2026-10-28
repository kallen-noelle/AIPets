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
          description={t('settings.reactShell.toolCardsEnableHint', {
            defaultValue: 'Show each tool call and its result in the chat transcript.',
          })}
          checked={enabled}
          onChange={setEnabled}
        />

        <ToggleField
          label={t('settings.pages.modules.tool-cards.reply-cards', { defaultValue: 'Draw cards in replies' })}
          description={t('settings.reactShell.toolCardsReplyHint', {
            defaultValue: 'On: draw a result card. Off: draw one compact line per call.',
          })}
          checked={replyCardsEnabled}
          onChange={setReplyCardsEnabled}
        />
      </SectionCard>
    </section>
  )
}
