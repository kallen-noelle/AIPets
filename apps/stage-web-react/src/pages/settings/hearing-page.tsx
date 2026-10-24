import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useProviders } from '../../providers/store'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

/** Same keys as the Vue hearing store, so both apps share the selection. */
const activeProviderKey = 'settings/hearing/active-provider'
const activeModelKey = 'settings/hearing/active-model'
const rephraseProviderKey = 'settings/hearing/rephrase-provider'
const rephraseModelKey = 'settings/hearing/rephrase-model'

export function HearingPage() {
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

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.modules.hearing.title', { defaultValue: 'Hearing' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.pages.modules.hearing.description', { defaultValue: '' })}
        </p>
      </header>

      <div className="flex flex-col gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <h2 className="text-sm font-semibold">
          {t('settings.reactShell.transcriptionSource', { defaultValue: 'Transcription provider' })}
        </h2>

        {transcriptionProviders.length === 0
          ? (
              <p className="text-xs text-[var(--airi-muted)]">
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
              <label className="flex flex-col gap-1 text-sm">
                <span>{t('settings.reactShell.activeProvider', { defaultValue: 'Active provider' })}</span>
                <select
                  className={fieldClass}
                  value={activeProvider}
                  onChange={event => setActiveProvider(event.target.value)}
                >
                  <option value="">—</option>
                  {transcriptionProviders.map((provider) => {
                    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
                    return (
                      <option key={provider.id} value={provider.id}>
                        {definition ? definition.nameLocalize({ t: translate }) : provider.definitionId}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.model', { defaultValue: 'Model' })}</span>
          <input
            className={fieldClass}
            value={activeModel}
            onChange={event => setActiveModel(event.target.value)}
            placeholder="whisper-1"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <h2 className="text-sm font-semibold">
          {t('settings.reactShell.rephrase', { defaultValue: 'Transcript rephrase' })}
        </h2>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.provider', { defaultValue: 'Provider' })}</span>
          <select
            className={fieldClass}
            value={rephraseProvider}
            onChange={event => setRephraseProvider(event.target.value)}
          >
            <option value="">—</option>
            {transcriptionProviders.map((provider) => {
              const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
              return (
                <option key={provider.id} value={provider.id}>
                  {definition ? definition.nameLocalize({ t: translate }) : provider.definitionId}
                </option>
              )
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.model', { defaultValue: 'Model' })}</span>
          <input
            className={fieldClass}
            value={rephraseModel}
            onChange={event => setRephraseModel(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/settings/modules/hearing/transcriber"
          className="border border-[var(--airi-border)] rounded-full px-4 py-2 text-sm"
        >
          {t('settings.reactShell.transcriber', { defaultValue: 'Transcriber' })}
        </Link>
        <Link
          to="/settings/modules/hearing/wake-words"
          className="border border-[var(--airi-border)] rounded-full px-4 py-2 text-sm"
        >
          {t('settings.reactShell.wakeWords', { defaultValue: 'Wake words' })}
        </Link>
      </div>
    </section>
  )
}
