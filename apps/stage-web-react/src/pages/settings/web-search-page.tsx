import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, TextField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const enabledKey = 'settings/web-search/enabled'
const apiKeyKey = 'settings/web-search/api-key'

export function WebSearchPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [apiKey, setApiKey] = useStoredValue(apiKeyKey, '')

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.web-search.title', { defaultValue: 'Web Search' })}
        description={t('settings.pages.modules.web-search.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.web-search.enable', { defaultValue: 'Enable Web Search' })}
          description={t('settings.pages.modules.web-search.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <TextField
          label={t('settings.pages.modules.web-search.api-key', { defaultValue: 'Tavily API Key' })}
          description={t('settings.pages.modules.web-search.api-key-description', { defaultValue: '' })}
          placeholder={t('settings.pages.modules.web-search.api-key-placeholder', { defaultValue: '' })}
          type="password"
          value={apiKey}
          onChange={setApiKey}
        />

        {enabled && apiKey.trim() && (
          <p className="text-xs text-emerald-400">
            {t('settings.pages.modules.web-search.configured', { defaultValue: 'Web search is ready to use!' })}
          </p>
        )}

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.notInChat', {
            defaultValue: 'The value is saved now. The React chat does not call this tool yet.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
