import { portableProviderDefinitions } from '@proj-aipets/provider-inference'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PageHeader, SectionCard, SelectField, TextField } from '../../components/fields'
import { useProviders } from '../../providers/store'
import { useStoredValue } from '../../settings/persisted'

/** Same keys as the Vue hearing store, so both apps share the selection. */
const activeProviderKey = 'settings/hearing/active-provider'
const activeModelKey = 'settings/hearing/active-model'
const rephraseProviderKey = 'settings/hearing/rephrase-provider'
const rephraseModelKey = 'settings/hearing/rephrase-model'

/**
 * Chooses the transcription provider and model.
 *
 * The microphone button in chat reads these values. The omni mode sends the
 * clip to the chat model instead, so this page matters in the provider mode.
 */
export function TranscriberPage() {
  const { t } = useTranslation()
  const providers = useProviders()

  const [activeProvider, setActiveProvider] = useStoredValue(activeProviderKey, '')
  const [activeModel, setActiveModel] = useStoredValue(activeModelKey, '')
  const [rephraseProvider, setRephraseProvider] = useStoredValue(rephraseProviderKey, '')
  const [rephraseModel, setRephraseModel] = useStoredValue(rephraseModelKey, '')

  const translate = (key: string) => String(t(key, { defaultValue: key }))

  const transcriptionProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('transcription') ?? false
  })

  const options = transcriptionProviders.map((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return {
      value: provider.id,
      label: definition ? definition.nameLocalize({ t: translate }) : provider.definitionId,
    }
  })

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.hearing.transcriber.title', { defaultValue: 'Speech recognition' })}
        description={t('settings.pages.modules.hearing.transcriber.description', {
          defaultValue: 'Choose the transcription provider and model.',
        })}
      />

      <SectionCard
        title={t('settings.reactShell.transcriptionSource', { defaultValue: 'Transcription provider' })}
      >
        {transcriptionProviders.length === 0
          ? (
              <p className="text-xs text-[var(--aipets-muted)]">
                {t('settings.reactShell.noTranscriptionProvider', {
                  defaultValue: 'No transcription provider configured yet.',
                })}
                {' '}
                <Link to="/settings/providers" className="underline">
                  {t('settings.reactShell.manageProviders', { defaultValue: 'Manage providers' })}
                </Link>
              </p>
            )
          : (
              <SelectField
                label={t('settings.reactShell.activeProvider', { defaultValue: 'Active provider' })}
                value={activeProvider}
                options={[{ value: '', label: '—' }, ...options]}
                onChange={setActiveProvider}
              />
            )}

        <TextField
          label={t('settings.reactShell.model', { defaultValue: 'Model' })}
          value={activeModel}
          placeholder="whisper-1"
          onChange={setActiveModel}
        />
      </SectionCard>

      <SectionCard title={t('settings.reactShell.rephrase', { defaultValue: 'Transcript rephrase' })}>
        <SelectField
          label={t('settings.reactShell.provider', { defaultValue: 'Provider' })}
          value={rephraseProvider}
          options={[{ value: '', label: '—' }, ...options]}
          onChange={setRephraseProvider}
        />

        <TextField
          label={t('settings.reactShell.model', { defaultValue: 'Model' })}
          value={rephraseModel}
          onChange={setRephraseModel}
        />
      </SectionCard>

      <Link to="/settings/modules/hearing" className="text-sm underline">
        {t('settings.pages.modules.hearing.title', { defaultValue: 'Hearing' })}
      </Link>
    </section>
  )
}
