import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, SliderField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'
import { addSticker, removeSticker, useStickers } from '../../stickers/store'

const enabledKey = 'settings/stickers/enabled'
const frequencyKey = 'settings/stickers/frequency'

export function StickersPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [frequency, setFrequency] = useStoredValue(frequencyKey, 50)
  const stickers = useStickers()
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = (file: File | undefined) => {
    if (!file)
      return

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string')
        return

      const stored = addSticker(file.name, reader.result)
      setMessage(stored
        ? null
        : t('settings.reactShell.stickersTooLarge', {
            defaultValue: 'The image is too large. Use one under 1.5 MB.',
          }))
    })
    reader.readAsDataURL(file)
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.stickers.title', { defaultValue: 'Stickers' })}
        description={t('settings.pages.modules.stickers.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.stickers.enable', { defaultValue: 'Enable stickers' })}
          description={t('settings.reactShell.stickersEnableHint', {
            defaultValue: 'Add a sticker button to the chat and let the character answer with a sticker.',
          })}
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
      </SectionCard>

      <SectionCard
        title={t('settings.pages.modules.stickers.catalog', { defaultValue: 'Available stickers' })}
        description={t('settings.reactShell.stickersLibraryHint', {
          defaultValue: 'Upload images up to 1.5 MB each. Up to 24 stickers stay in this browser.',
        })}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? []))
              upload(file)
            event.target.value = ''
          }}
        />

        <button
          type="button"
          className="self-start border border-[var(--aipets-border)] rounded-xl px-3 py-1.5 text-xs transition hover:bg-[var(--aipets-hover)]"
          onClick={() => inputRef.current?.click()}
        >
          <span className="i-solar:add-circle-bold-duotone" />
          {' '}
          {t('settings.reactShell.stickersAdd', { defaultValue: 'Add stickers' })}
        </button>

        {message && <p className="text-xs text-rose-400">{message}</p>}

        {stickers.length === 0
          ? (
              <p className="text-xs text-[var(--aipets-muted)]">
                {t('settings.reactShell.stickersEmpty', { defaultValue: 'No stickers yet.' })}
              </p>
            )
          : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {stickers.map(sticker => (
                  <li key={sticker.id} className="flex flex-col gap-1">
                    <img
                      src={sticker.dataUrl}
                      alt={sticker.name}
                      className="aspect-square w-full border border-[var(--aipets-border)] rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      className="text-xs text-[var(--aipets-muted)] hover:text-rose-400"
                      onClick={() => removeSticker(sticker.id)}
                    >
                      {t('settings.reactShell.deleteEntry', { defaultValue: 'Delete' })}
                    </button>
                  </li>
                ))}
              </ul>
            )}

        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.pages.modules.stickers.local-only', {
            defaultValue: 'Images stay on this device. Cloud chat sync transfers text only.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
