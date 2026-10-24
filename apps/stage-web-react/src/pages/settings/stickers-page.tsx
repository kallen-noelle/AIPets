import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, SliderField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const enabledKey = 'settings/stickers/enabled'
const frequencyKey = 'settings/stickers/frequency'

export function StickersPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [frequency, setFrequency] = useStoredValue(frequencyKey, 50)

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.stickers.title', { defaultValue: 'Stickers' })}
        description={t('settings.pages.modules.stickers.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.stickers.enable', { defaultValue: 'Enable stickers' })}
          description={t('settings.pages.modules.stickers.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <SliderField
          label={t('settings.pages.modules.stickers.frequency', { defaultValue: 'Sticker frequency' })}
          description={t('settings.pages.modules.stickers.frequency-description', { defaultValue: '' })}
          value={frequency}
          min={0}
          max={100}
          step={5}
          onChange={setFrequency}
        />

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.pages.modules.stickers.local-only', {
            defaultValue: 'Images stay on this device. Cloud chat sync transfers text only.',
          })}
        </p>

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.stickersLibraryNote', {
            defaultValue: 'Sticker artwork and chatting with stickers are not part of the React app yet.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
