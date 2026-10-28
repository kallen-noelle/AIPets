import { useTranslation } from 'react-i18next'

import { useStoredValue } from '../../settings/persisted'
import { sceneBackgroundKey } from '../../settings/scene'

export function ScenePage() {
  const { t } = useTranslation()
  const [background, setBackground] = useStoredValue(sceneBackgroundKey, '')

  const pickBackground = (file: File | undefined) => {
    if (!file)
      return

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string')
        setBackground(reader.result)
    })
    reader.readAsDataURL(file)
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.scene.title', { defaultValue: 'Scenes' })}
        </h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.reactShell.sceneDescription', {
            defaultValue: 'Background shown behind the character.',
          })}
        </p>
      </header>

      <div className="flex flex-col gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
        {background
          ? (
              <img src={background} alt="" className="max-h-56 w-full rounded-xl object-cover" />
            )
          : (
              <p className="text-xs text-[var(--aipets-muted)]">
                {t('settings.reactShell.noBackground', { defaultValue: 'No background selected.' })}
              </p>
            )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="border border-[var(--aipets-border)] rounded-full px-4 py-1.5 text-xs hover:bg-[var(--aipets-hover)]">
            {t('settings.reactShell.chooseBackground', { defaultValue: 'Choose image' })}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                pickBackground(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>

          {background && (
            <button
              type="button"
              className="text-xs text-[var(--aipets-muted)] hover:text-rose-400"
              onClick={() => setBackground('')}
            >
              {t('settings.reactShell.clearBackground', { defaultValue: 'Clear background' })}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
