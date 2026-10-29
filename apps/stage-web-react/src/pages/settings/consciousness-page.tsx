import { portableProviderDefinitions } from '@proj-aipets/provider-inference'
import { useTranslation } from 'react-i18next'

import { chatModelKey, chatProviderKey } from '../../chat/types'
import { PageHeader, SectionCard, SelectField, SliderField, TextField, ToggleField } from '../../components/fields'
import { useProviders } from '../../providers/store'
import { useStoredValue } from '../../settings/persisted'

const temperatureKey = 'settings/consciousness/active-temperature'
const topPKey = 'settings/consciousness/active-top-p'
const temperatureEnabledKey = 'settings/consciousness/temperature-enabled'
const topPEnabledKey = 'settings/consciousness/top-p-enabled'

/**
 * The consciousness page edits the values the chat request uses.
 *
 * It writes the chat provider and model keys directly, so the chat panel, the
 * director, and this page always agree on one active model. The sampling
 * toggles gate the optional request fields.
 */
export function ConsciousnessPage() {
  const { t } = useTranslation()
  const providers = useProviders()

  const [providerId, setProviderId] = useStoredValue(chatProviderKey, '')
  const [model, setModel] = useStoredValue(chatModelKey, '')
  const [temperature, setTemperature] = useStoredValue(temperatureKey, 0.7)
  const [topP, setTopP] = useStoredValue(topPKey, 1)
  const [temperatureEnabled, setTemperatureEnabled] = useStoredValue(temperatureEnabledKey, false)
  const [topPEnabled, setTopPEnabled] = useStoredValue(topPEnabledKey, false)

  const chatProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('chat') ?? false
  })

  const duplicateDefinitions = new Set(
    chatProviders
      .map(provider => provider.definitionId)
      .filter((definitionId, index, all) => all.indexOf(definitionId) !== index),
  )

  const options = [
    { value: '', label: t('settings.reactShell.providerNone', { defaultValue: 'None' }) },
    ...chatProviders.map((provider) => {
      const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
      const name = definition?.name ?? provider.definitionId
      const label = duplicateDefinitions.has(provider.definitionId)
        ? `${name} · ${provider.id.slice(0, 6)}`
        : name
      return { value: provider.id, label }
    }),
  ]

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.consciousness.title', { defaultValue: 'Consciousness' })}
        description={t('settings.pages.modules.consciousness.description', { defaultValue: '' })}
      />

      <SectionCard
        description={t('settings.reactShell.consciousnessHint', {
          defaultValue: 'The chat panel and the animation director use this provider and model.',
        })}
      >
        <SelectField
          label={t('settings.reactShell.providerLabel', { defaultValue: 'Provider' })}
          value={providerId}
          options={options}
          onChange={setProviderId}
        />

        <TextField
          label={t('settings.reactShell.modelLabel', { defaultValue: 'Model' })}
          value={model}
          placeholder="qwen3.8-omni-flash"
          onChange={setModel}
        />
      </SectionCard>

      <SectionCard description={t('settings.reactShell.samplingHint', {
        defaultValue: 'Turn an option on only when the model supports that parameter.',
      })}
      >
        <ToggleField
          label={t('settings.reactShell.temperature', { defaultValue: 'Temperature' })}
          checked={temperatureEnabled}
          onChange={setTemperatureEnabled}
        />

        {temperatureEnabled && (
          <SliderField
            label={t('settings.reactShell.temperatureValue', { defaultValue: 'Value' })}
            value={temperature}
            min={0}
            max={2}
            step={0.1}
            onChange={setTemperature}
          />
        )}

        <ToggleField
          label={t('settings.reactShell.topP', { defaultValue: 'Top P' })}
          checked={topPEnabled}
          onChange={setTopPEnabled}
        />

        {topPEnabled && (
          <SliderField
            label={t('settings.reactShell.topPValue', { defaultValue: 'Value' })}
            value={topP}
            min={0}
            max={1}
            step={0.05}
            onChange={setTopP}
          />
        )}
      </SectionCard>
    </section>
  )
}
