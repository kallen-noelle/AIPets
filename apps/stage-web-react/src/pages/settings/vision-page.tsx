import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, SelectField, TextField, ToggleField } from '../../components/fields'
import { useProviders } from '../../providers/store'
import { useStoredValue } from '../../settings/persisted'

const providerKey = 'settings/vision/active-provider'
const modelKey = 'settings/vision/active-model'
const useForChatKey = 'settings/vision/use-for-chat'
const useForToolImagesKey = 'settings/vision/use-for-tool-images'

export function VisionPage() {
  const { t } = useTranslation()
  const providers = useProviders()

  const [providerId, setProviderId] = useStoredValue(providerKey, '')
  const [model, setModel] = useStoredValue(modelKey, '')
  const [useForChat, setUseForChat] = useStoredValue(useForChatKey, true)
  const [useForToolImages, setUseForToolImages] = useStoredValue(useForToolImagesKey, true)

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
        title={t('settings.pages.modules.vision.title', { defaultValue: 'Vision' })}
        description={t('settings.reactShell.visionNote', {
          defaultValue: 'Chat reads an attached image directly. A separate vision model is optional.',
        })}
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

        <ToggleField
          label={t('settings.reactShell.visionUseForChat', { defaultValue: 'Use this model for chat images' })}
          checked={useForChat}
          onChange={setUseForChat}
        />

        <ToggleField
          label={t('settings.reactShell.visionUseForToolImages', { defaultValue: 'Use this model for tool images' })}
          checked={useForToolImages}
          onChange={setUseForToolImages}
        />
      </SectionCard>
    </section>
  )
}
