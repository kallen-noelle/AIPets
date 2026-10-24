import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useProviders } from '../../providers/store'
import { useStoredValue } from '../../settings/persisted'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

export function SpeechPage() {
  const { t } = useTranslation()
  const providers = useProviders()
  const [model, setModel] = useStoredValue('airi:react:speech/model', '')
  const [voice, setVoice] = useStoredValue('airi:react:speech/voice', '')
  const [selectedProvider, setSelectedProvider] = useStoredValue('airi:react:speech/provider', '')

  const translate = (key: string) => String(t(key, { defaultValue: key }))

  const speechProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('speech') ?? false
  })

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.modules.speech.title', { defaultValue: 'Speech' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.pages.modules.speech.description', { defaultValue: '' })}
        </p>
      </header>

      <div className="flex flex-col gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <h2 className="text-sm font-semibold">
          {t('settings.reactShell.speechSource', { defaultValue: 'Speech provider' })}
        </h2>

        {speechProviders.length === 0
          ? (
              <p className="text-xs text-[var(--airi-muted)]">
                {t('settings.reactShell.noSpeechProvider', { defaultValue: 'No speech provider configured yet.' })}
                {' '}
                <Link to="/settings/providers" className="underline">
                  {t('settings.reactShell.manageProviders', { defaultValue: 'Manage providers' })}
                </Link>
              </p>
            )
          : (
              <ul className="flex flex-col gap-2">
                {speechProviders.map((provider) => {
                  const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)

                  return (
                    <li key={provider.id} className="flex items-center justify-between gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="speech-provider"
                          checked={(selectedProvider || speechProviders[0]?.id) === provider.id}
                          onChange={() => setSelectedProvider(provider.id)}
                        />
                        <span>{definition ? definition.nameLocalize({ t: translate }) : provider.definitionId}</span>
                      </label>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                        {t('settings.reactShell.configured', { defaultValue: 'Configured' })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
      </div>

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.model', { defaultValue: 'Model' })}</span>
          <input
            className={fieldClass}
            value={model}
            onChange={event => setModel(event.target.value)}
            placeholder="tts-1"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.voice', { defaultValue: 'Voice' })}</span>
          <input
            className={fieldClass}
            value={voice}
            onChange={event => setVoice(event.target.value)}
            placeholder="alloy"
          />
        </label>

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.speechPreviewPending', {
            defaultValue: 'Voice listing and preview come later. These values are saved locally.',
          })}
        </p>
      </div>
    </section>
  )
}
