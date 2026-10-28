import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, ToggleField } from '../../components/fields'
import { readStored, useStoredValue, writeStored } from '../../settings/persisted'

/** Same keys as the Vue voiceprint store, so both apps read one record. */
const storedKey = 'settings/voice/voiceprint'
const deletedAtKey = 'settings/voice/voiceprint-deleted-at'
const speakerRecognitionKey = 'settings/hearing/speaker-recognition-enabled'

interface StoredVoiceprint {
  createdAt?: number
  seconds?: number
}

function readRecord(): StoredVoiceprint | null {
  const stored = readStored<unknown>(storedKey, null)
  if (typeof stored !== 'object' || stored === null)
    return null

  const record = stored as Record<string, unknown>
  return {
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : undefined,
    seconds: typeof record.seconds === 'number' ? record.seconds : undefined,
  }
}

/**
 * Shows the saved voiceprint of the device owner.
 *
 * Enrollment needs the speaker model, which the React app does not load yet.
 * This page reads, explains, and deletes a record that the Vue voice pipeline
 * wrote, so the data stays under the owner's control.
 */
export function VoiceprintPage() {
  const { t } = useTranslation()
  const [record, setRecord] = useState<StoredVoiceprint | null>(readRecord)
  const [speakerRecognition, setSpeakerRecognition] = useStoredValue(speakerRecognitionKey, false)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storedKey)
        setRecord(readRecord())
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const remove = () => {
    localStorage.removeItem(storedKey)
    // The Vue store compares this time with enrollments that started earlier.
    writeStored(deletedAtKey, Date.now())
    setRecord(null)
    setSpeakerRecognition(false)
  }

  const date = record?.createdAt ? new Date(record.createdAt).toLocaleDateString() : ''
  const status = record?.createdAt
    ? t('settings.pages.modules.hearing.voiceprint.status.enrolled', {
        defaultValue: 'Enrolled on {{date}}, from {{seconds}} s of speech.',
        date,
        seconds: Math.round(record.seconds ?? 0),
      })
    : t('settings.pages.modules.hearing.voiceprint.status.none', { defaultValue: 'You have no voiceprint.' })

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.hearing.voiceprint.title', { defaultValue: 'Voiceprint' })}
        description={t('settings.pages.modules.hearing.voiceprint.description', { defaultValue: '' })}
      />

      <SectionCard>
        <p className="text-sm">{status}</p>
        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.pages.modules.hearing.voiceprint.privacy', { defaultValue: '' })}
        </p>

        {record && (
          <button
            type="button"
            onClick={remove}
            className="self-start text-xs text-[var(--aipets-muted)] hover:text-rose-400"
          >
            {t('settings.pages.modules.hearing.voiceprint.delete', { defaultValue: 'Delete voiceprint' })}
          </button>
        )}

        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.voiceprintEnrollmentNote', {
            defaultValue: 'Enrolling needs the voiceprint model, which this React app does not load yet.',
          })}
        </p>
      </SectionCard>

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.hearing.voiceprint.speaker-recognition.label', {
            defaultValue: 'Speaker recognition',
          })}
          description={t('settings.pages.modules.hearing.voiceprint.speaker-recognition.description', {
            defaultValue: '',
          })}
          checked={speakerRecognition}
          disabled={!record}
          onChange={setSpeakerRecognition}
        />

        {!record && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.pages.modules.hearing.voiceprint.speaker-recognition.needs-voiceprint', {
              defaultValue: 'Enroll your voice to turn on speaker recognition.',
            })}
          </p>
        )}
      </SectionCard>
    </section>
  )
}
