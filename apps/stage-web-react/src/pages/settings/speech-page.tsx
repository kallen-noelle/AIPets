import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { SectionCard, SelectField, SliderField, ToggleField } from '../../components/fields'
import { useProviders } from '../../providers/store'
import { definitionHasTask } from '../../providers/tasks'
import { useStoredValue } from '../../settings/persisted'
import { isLocalSpeechAvailable } from '../../speech/playback'

const fieldClass = [
  'w-full rounded-xl border border-[var(--aipets-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--aipets-fg)]',
].join(' ')

const languages = [
  { value: 'zh-CN', label: '中文（普通话）' },
  { value: 'zh-TW', label: '中文（台灣）' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
]

export function SpeechPage() {
  const { t } = useTranslation()
  const providers = useProviders()

  const [localEnabled, setLocalEnabled] = useStoredValue('aipets:react:speech/local', true)
  const [localLanguage, setLocalLanguage] = useStoredValue('aipets:react:speech/local-language', 'zh-CN')
  const [localVoice, setLocalVoice] = useStoredValue('aipets:react:speech/local-voice', '')
  const [localRate, setLocalRate] = useStoredValue('aipets:react:speech/local-rate', 1)
  const [localPitch, setLocalPitch] = useStoredValue('aipets:react:speech/local-pitch', 1)

  const [model, setModel] = useStoredValue('aipets:react:speech/model', '')
  const [voice, setVoice] = useStoredValue('aipets:react:speech/voice', '')
  const [selectedProvider, setSelectedProvider] = useStoredValue('aipets:react:speech/provider', '')

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const localSupported = isLocalSpeechAvailable()

  useEffect(() => {
    if (!localSupported)
      return

    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
    }
  }, [localSupported])

  const translate = (key: string) => String(t(key, { defaultValue: key }))

  const speechProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definitionHasTask(definition?.tasks, 'speech')
  })

  const languagePrefix = localLanguage.slice(0, 2).toLowerCase()
  const voiceOptions = [
    { value: '', label: t('settings.reactShell.speechLocalVoiceAuto', { defaultValue: 'Automatic' }) },
    ...voices
      .filter(item => item.lang.toLowerCase().startsWith(languagePrefix))
      .map(item => ({ value: item.voiceURI, label: `${item.name} (${item.lang})` })),
  ]

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.modules.speech.title', { defaultValue: 'Speech' })}
        </h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.pages.modules.speech.description', { defaultValue: '' })}
        </p>
      </header>

      <SectionCard
        title={t('settings.reactShell.speechLocalTitle', { defaultValue: 'Browser speech' })}
        description={t('settings.reactShell.speechLocalDescription', {
          defaultValue: 'Uses the speech engine of this browser. No API key and no network request.',
        })}
      >
        {!localSupported && (
          <p className="text-xs text-rose-400">
            {t('settings.reactShell.speechLocalUnavailable', {
              defaultValue: 'This browser has no speech synthesis support.',
            })}
          </p>
        )}

        <ToggleField
          label={t('settings.reactShell.speechLocalEnable', { defaultValue: 'Read replies with browser speech' })}
          description={t('settings.reactShell.speechLocalEnableDescription', {
            defaultValue: 'When on, the chat reads each reply with this browser and ignores the remote provider.',
          })}
          checked={localEnabled}
          onChange={setLocalEnabled}
        />

        <SelectField
          label={t('settings.reactShell.speechLocalLanguage', { defaultValue: 'Language' })}
          value={localLanguage}
          options={languages}
          onChange={setLocalLanguage}
        />

        <SelectField
          label={t('settings.reactShell.speechLocalVoice', { defaultValue: 'Voice' })}
          description={t('settings.reactShell.speechLocalVoiceDescription', {
            defaultValue: 'The list comes from the operating system. Install more voices in system settings.',
          })}
          value={localVoice}
          options={voiceOptions}
          onChange={setLocalVoice}
        />

        <SliderField
          label={t('settings.reactShell.speechLocalRate', { defaultValue: 'Rate' })}
          value={localRate}
          min={0.5}
          max={2}
          step={0.1}
          onChange={setLocalRate}
        />

        <SliderField
          label={t('settings.reactShell.speechLocalPitch', { defaultValue: 'Pitch' })}
          value={localPitch}
          min={0.5}
          max={2}
          step={0.1}
          onChange={setLocalPitch}
        />
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.speechRemoteTitle', { defaultValue: 'Remote speech provider' })}
        description={t('settings.reactShell.speechRemoteDescription', {
          defaultValue: 'Used only when browser speech is off.',
        })}
      >
        {speechProviders.length === 0
          ? (
              <p className="text-xs text-[var(--aipets-muted)]">
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
      </SectionCard>
    </section>
  )
}
