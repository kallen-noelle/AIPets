import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PageHeader, SectionCard, TextField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const imageModelKey = 'aipets:react:image/model'

export function ArtistryPage() {
  const { t } = useTranslation()
  const [model, setModel] = useStoredValue(imageModelKey, '')

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.artistry.title', { defaultValue: 'Artistry' })}
        description={t('settings.pages.modules.artistry.description', { defaultValue: '' })}
      />

      <SectionCard>
        <TextField
          label={t('settings.reactShell.artistryModel', { defaultValue: 'Image model' })}
          description={t('settings.reactShell.artistryModelDescription', {
            defaultValue: 'DashScope uses wanx2.1-t2i-turbo by default.',
          })}
          value={model}
          placeholder="wanx2.1-t2i-turbo"
          onChange={setModel}
        />

        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.artistryProviderNote', {
            defaultValue: 'Image generation reuses the API key of the chat provider you select in chat.',
          })}
        </p>

        <Link
          to="/settings/providers"
          className="border border-[var(--aipets-border)] rounded-full px-4 py-1.5 text-xs hover:bg-[var(--aipets-hover)]"
        >
          {t('settings.reactShell.manageProviders', { defaultValue: 'Manage providers' })}
        </Link>
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.sceneDescription', { defaultValue: 'Background shown behind the character.' })}
      >
        <Link
          to="/settings/scene"
          className="border border-[var(--aipets-border)] rounded-full px-4 py-1.5 text-xs hover:bg-[var(--aipets-hover)]"
        >
          {t('settings.pages.scene.title', { defaultValue: 'Scenes' })}
        </Link>
      </SectionCard>
    </section>
  )
}
