import { portableProviderDefinitions } from '@proj-aipets/provider-inference'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { chatModelKey } from '../chat/types'
import { useProviders } from '../providers/store'
import { useStoredValue } from '../settings/persisted'

/** Set when the owner dismisses the hint on this device. */
export const configurationHintDismissedKey = 'aipets:react:onboarding/hint-dismissed'

const actionClass = [
  'rounded-full border border-[var(--aipets-border)] px-3 py-1.5 text-xs',
  'text-[var(--aipets-fg)] hover:bg-[var(--aipets-hover)]',
].join(' ')

/**
 * One hint that stays until a chat provider and a model are ready.
 *
 * The Vue app ran a four-step onboarding wizard. Its steps only wrote the
 * provider configuration and the chat model, so this app shows one panel.
 */
export function ConfigurationHint() {
  const { t } = useTranslation()
  const providers = useProviders()
  const [model] = useStoredValue(chatModelKey, '')
  const [dismissed, setDismissed] = useStoredValue(configurationHintDismissedKey, false)

  const hasChatProvider = Object.values(providers).some((provider) => {
    if (provider.status !== 'configured')
      return false

    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('chat') ?? false
  })

  if (dismissed || (hasChatProvider && model.trim()))
    return null

  return (
    <section
      role="status"
      className={[
        'flex flex-col gap-3 rounded-2xl border border-amber-400/40 p-4',
        'bg-amber-400/10 text-sm',
      ].join(' ')}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">
          {t('settings.reactShell.onboardingHintTitle', { defaultValue: 'Configure a model to start' })}
        </h2>
        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.onboardingHintBody', {
            defaultValue: 'The chat needs a configured chat provider and a model. Both take one minute to set.',
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/settings/providers" className={actionClass}>
          {t('settings.reactShell.onboardingAddProvider', { defaultValue: 'Add a provider' })}
        </Link>
        <Link to="/settings/modules/consciousness" className={actionClass}>
          {t('settings.reactShell.onboardingChooseModel', { defaultValue: 'Choose a model' })}
        </Link>
        <button
          type="button"
          className="text-xs text-[var(--aipets-muted)] hover:text-[var(--aipets-fg)]"
          onClick={() => setDismissed(true)}
        >
          {t('settings.reactShell.onboardingDismiss', { defaultValue: 'Dismiss' })}
        </button>
      </div>
    </section>
  )
}
