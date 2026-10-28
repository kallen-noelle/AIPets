import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PageHeader, SectionCard, SelectField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'
import { isLocalRecognitionAvailable } from '../../speech/local-recognition'

const languages = [
  { value: 'zh-CN', label: '中文（普通话）' },
  { value: 'zh-TW', label: '中文（台灣）' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
]

const subpageClass = [
  'rounded-full border border-[var(--aipets-border)] px-4 py-2 text-sm',
  'hover:bg-[var(--aipets-hover)]',
].join(' ')

/**
 * Picks how the microphone turns speech into text.
 *
 * The provider and model of the remote modes live on the transcriber page.
 */
export function HearingPage() {
  const { t } = useTranslation()

  const [hearingMode, setHearingMode] = useStoredValue('aipets:react:hearing/mode', 'omni')
  const [localLanguage, setLocalLanguage] = useStoredValue('aipets:react:hearing/local-language', 'zh-CN')
  const localSupported = isLocalRecognitionAvailable()

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.hearing.title', { defaultValue: 'Hearing' })}
        description={t('settings.pages.modules.hearing.description', { defaultValue: '' })}
      />

      <SectionCard
        title={t('settings.reactShell.hearingModeTitle', { defaultValue: 'Voice input' })}
        description={t('settings.reactShell.hearingModeDescription', {
          defaultValue: 'Choose how the microphone turns speech into text.',
        })}
      >
        {!localSupported && hearingMode === 'browser' && (
          <p className="text-xs text-rose-400">
            {t('settings.reactShell.hearingLocalUnavailable', {
              defaultValue: 'This browser has no speech recognition support. Chrome, Edge, and Safari support it.',
            })}
          </p>
        )}

        <SelectField
          label={t('settings.reactShell.hearingMode', { defaultValue: 'Method' })}
          value={hearingMode}
          options={[
            {
              value: 'omni',
              label: t('settings.reactShell.hearingModeOmni', { defaultValue: 'Omni model transcription' }),
            },
            {
              value: 'browser',
              label: t('settings.reactShell.hearingModeBrowser', { defaultValue: 'Browser speech recognition' }),
            },
            {
              value: 'provider',
              label: t('settings.reactShell.hearingModeProvider', { defaultValue: 'Remote transcription provider' }),
            },
          ]}
          onChange={setHearingMode}
        />

        {hearingMode === 'omni' && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.hearingModeOmniDescription', {
              defaultValue: 'The clip goes to the chat model you selected, so it works without a transcription endpoint. Recommended on Windows.',
            })}
          </p>
        )}

        {hearingMode === 'browser' && (
          <SelectField
            label={t('settings.reactShell.hearingLocalLanguage', { defaultValue: 'Recognition language' })}
            value={localLanguage}
            options={languages}
            onChange={setLocalLanguage}
          />
        )}
      </SectionCard>

      <div className="flex flex-wrap gap-3">
        <Link to="/settings/modules/hearing/transcriber" className={subpageClass}>
          {t('settings.reactShell.transcriber', { defaultValue: 'Transcriber' })}
        </Link>
        <Link to="/settings/modules/hearing/wake-words" className={subpageClass}>
          {t('settings.reactShell.wakeWords', { defaultValue: 'Wake words' })}
        </Link>
        <Link to="/settings/modules/hearing/voiceprint" className={subpageClass}>
          {t('settings.pages.modules.hearing.voiceprint.title', { defaultValue: 'Voiceprint' })}
        </Link>
      </div>
    </section>
  )
}
