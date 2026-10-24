import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, SelectField, SliderField, TextField, ToggleField } from '../../components/fields'
import { useProviders } from '../../providers/store'
import { useStoredValue } from '../../settings/persisted'

const providerKey = 'settings/consciousness/active-provider'
const modelKey = 'settings/consciousness/active-model'
const temperatureKey = 'settings/consciousness/active-temperature'
const topPKey = 'settings/consciousness/active-top-p'
const temperatureEnabledKey = 'settings/consciousness/temperature-enabled'
const topPEnabledKey = 'settings/consciousness/top-p-enabled'

export function ConsciousnessPage() {
  const { t } = useTranslation()
  const providers = useProviders()

  const [providerId, setProviderId] = useStoredValue(providerKey, '')
  const [model, setModel] = useStoredValue(modelKey, '')
  const [temperature, setTemperature] = useStoredValue(temperatureKey, 0.7)
  const [topP, setTopP] = useStoredValue(topPKey, 1)
  const [temperatureEnabled, setTemperatureEnabled] = useStoredValue(temperatureEnabledKey, false)
  const [topPEnabled, setTopPEnabled] = useStoredValue(topPEnabledKey, false)

  const options = [
    { value: '', label: t('settings.reactShell.providerNone', { defaultValue: 'None' }) },
    ...Array.from(new Set(Object.values(providers).map(provider => provider.definitionId)))
      .map((definitionId) => {
        const definition = portableProviderDefinitions.find(item => item.id === definitionId)
        return { value: definitionId, label: definition?.name ?? definitionId }
      }),
  ]

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.consciousness.title', { defaultValue: 'Consciousness' })}
        description={t('settings.pages.modules.consciousness.description', { defaultValue: '' })}
      />

      <SectionCard>
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
