import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, TextField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const enabledKey = 'settings/twitter/enabled'
const apiKeyKey = 'settings/twitter/api-key'
const apiSecretKey = 'settings/twitter/api-secret'
const accessTokenKey = 'settings/twitter/access-token'
const accessTokenSecretKey = 'settings/twitter/access-token-secret'

export function XPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [apiKey, setApiKey] = useStoredValue(apiKeyKey, '')
  const [apiSecret, setApiSecret] = useStoredValue(apiSecretKey, '')
  const [accessToken, setAccessToken] = useStoredValue(accessTokenKey, '')
  const [accessTokenSecret, setAccessTokenSecret] = useStoredValue(accessTokenSecretKey, '')

  const configured = [apiKey, apiSecret, accessToken, accessTokenSecret].every(value => value.trim())

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.x.title', { defaultValue: 'X / Twitter' })}
        description={t('settings.pages.modules.x.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.x.enable', { defaultValue: 'Enable X / Twitter Integration' })}
          description={t('settings.pages.modules.x.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <TextField
          label={t('settings.pages.modules.x.api-key', { defaultValue: 'API Key' })}
          type="password"
          value={apiKey}
          onChange={setApiKey}
        />

        <TextField
          label={t('settings.pages.modules.x.api-secret', { defaultValue: 'API Secret' })}
          type="password"
          value={apiSecret}
          onChange={setApiSecret}
        />

        <TextField
          label={t('settings.pages.modules.x.access-token', { defaultValue: 'Access Token' })}
          type="password"
          value={accessToken}
          onChange={setAccessToken}
        />

        <TextField
          label={t('settings.pages.modules.x.access-token-secret', { defaultValue: 'Access Token Secret' })}
          type="password"
          value={accessTokenSecret}
          onChange={setAccessTokenSecret}
        />

        {enabled && configured && (
          <p className="text-xs text-emerald-400">
            {t('settings.pages.modules.x.configured', { defaultValue: 'X / Twitter is properly configured!' })}
          </p>
        )}

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.messagingRuntimeNote', {
            defaultValue: 'The bot connects in the desktop app. This page stores the token.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
