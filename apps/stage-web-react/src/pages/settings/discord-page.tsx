import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, TextField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const enabledKey = 'settings/discord/enabled'
const tokenKey = 'settings/discord/token'

export function DiscordPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(enabledKey, false)
  const [token, setToken] = useStoredValue(tokenKey, '')

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.messaging-discord.title', { defaultValue: 'Discord' })}
        description={t('settings.pages.modules.messaging-discord.description', { defaultValue: '' })}
      />

      <SectionCard>
        <ToggleField
          label={t('settings.pages.modules.messaging-discord.enable', { defaultValue: 'Enable Discord Integration' })}
          description={t('settings.pages.modules.messaging-discord.enable-description', { defaultValue: '' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <TextField
          label={t('settings.pages.modules.messaging-discord.token', { defaultValue: 'Bot Token' })}
          description={t('settings.pages.modules.messaging-discord.token-description', { defaultValue: '' })}
          placeholder={t('settings.pages.modules.messaging-discord.token-placeholder', { defaultValue: '' })}
          type="password"
          value={token}
          onChange={setToken}
        />

        {enabled && token.trim() && (
          <p className="text-xs text-emerald-400">
            {t('settings.pages.modules.messaging-discord.configured', {
              defaultValue: 'Discord is properly configured!',
            })}
          </p>
        )}

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.messagingRuntimeNote', {
            defaultValue: 'The bot connects in the desktop app. This page stores the token.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
