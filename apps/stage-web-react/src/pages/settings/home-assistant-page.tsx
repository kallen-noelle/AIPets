import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, SelectField, TextField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const enabledKey = 'settings/home-assistant/enabled'
const exposureKey = 'settings/home-assistant/exposure-mode'
const baseUrlKey = 'airi:react:home-assistant/base-url'
const tokenKey = 'airi:react:home-assistant/token'

export function HomeAssistantPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [exposure, setExposure] = useStoredValue(exposureKey, 'all')
  const [baseUrl, setBaseUrl] = useStoredValue(baseUrlKey, '')
  const [token, setToken] = useStoredValue(tokenKey, '')

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.home-assistant.title', { defaultValue: 'Home Assistant' })}
        description={t('settings.pages.modules.home-assistant.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.home-assistant.enable', { defaultValue: 'Enable Home Assistant' })}
          description={t('settings.pages.modules.home-assistant.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <TextField
          label={t('settings.reactShell.homeAssistantBaseUrl', { defaultValue: 'Base URL' })}
          value={baseUrl}
          placeholder="http://homeassistant.local:8123"
          onChange={setBaseUrl}
        />

        <TextField
          label={t('settings.reactShell.homeAssistantToken', { defaultValue: 'Access token' })}
          type="password"
          value={token}
          onChange={setToken}
        />

        <SelectField
          label={t('settings.reactShell.homeAssistantExposure', { defaultValue: 'Entity exposure' })}
          value={exposure}
          options={[
            { value: 'all', label: t('settings.reactShell.exposureAll', { defaultValue: 'All entities' }) },
            { value: 'allow', label: t('settings.reactShell.exposureAllow', { defaultValue: 'Allowed list only' }) },
            { value: 'deny', label: t('settings.reactShell.exposureDeny', { defaultValue: 'All except denied' }) },
          ]}
          onChange={setExposure}
        />

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.pages.modules.home-assistant.note', {
            defaultValue: 'The token stays on this device. It does not sync to your account.',
          })}
        </p>

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.notInChat', {
            defaultValue: 'The value is saved now. The React chat does not call this tool yet.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
