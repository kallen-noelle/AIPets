import type { AuthUser, SocialProvider } from '../../auth/oidc'

import { errorMessageFrom } from '@moeru/std'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { buildSignInUrl, clearTokens, fetchCurrentUser, getAccessToken, serverUrl } from '../../auth/oidc'

const buttonClass = [
  'rounded-full border border-[var(--airi-border)] px-4 py-2 text-sm transition',
  'hover:bg-[var(--airi-hover)] disabled:opacity-40',
].join(' ')

const providers: { id: SocialProvider, label: string, icon: string }[] = [
  { id: 'google', label: 'Google', icon: 'i-simple-icons:google' },
  { id: 'github', label: 'GitHub', icon: 'i-simple-icons:github' },
  { id: 'steam', label: 'Steam', icon: 'i-simple-icons:steam' },
]

export function AccountPage() {
  const { t } = useTranslation()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const next = getAccessToken() ? await fetchCurrentUser() : null
      if (getAccessToken() && !next)
        clearTokens()
      setUser(next)
    }
    catch (cause) {
      setError(errorMessageFrom(cause) ?? 'Session request failed')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signIn = async (provider: SocialProvider) => {
    setPendingProvider(provider)
    setError(null)

    try {
      window.location.assign(await buildSignInUrl(provider))
    }
    catch (cause) {
      setPendingProvider(null)
      setError(errorMessageFrom(cause) ?? 'Cannot start sign-in')
    }
  }

  const signOut = () => {
    clearTokens()
    setUser(null)
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.account.title', { defaultValue: 'Account' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.accountDescription', {
            defaultValue: 'Cloud sign-in uses the hosted AIRI auth service.',
          })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        {loading
          ? (
              <p className="text-sm text-[var(--airi-muted)]">
                {t('settings.reactShell.accountLoading', { defaultValue: 'Checking your session...' })}
              </p>
            )
          : user
            ? (
                <>
                  <div className="flex items-center gap-3">
                    {user.image
                      ? <img src={user.image} alt="" className="h-12 w-12 rounded-full object-cover" />
                      : <span className="i-solar:user-circle-bold-duotone h-12 w-12 text-4xl" />}

                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs text-[var(--airi-muted)]">{user.email ?? user.id}</span>
                    </div>
                  </div>

                  <div>
                    <button type="button" className={buttonClass} onClick={signOut}>
                      {t('settings.reactShell.accountSignOut', { defaultValue: 'Sign out' })}
                    </button>
                  </div>
                </>
              )
            : (
                <>
                  <p className="text-sm">
                    {t('settings.reactShell.accountSignedOut', {
                      defaultValue: 'You are signed out. Local features keep working without an account.',
                    })}
                  </p>

                  <div className="flex flex-wrap gap-3">
                    {providers.map(provider => (
                      <button
                        key={provider.id}
                        type="button"
                        className={`${buttonClass} inline-flex items-center gap-2`}
                        disabled={pendingProvider !== null}
                        onClick={() => void signIn(provider.id)}
                      >
                        <span className={provider.icon} />
                        {pendingProvider === provider.id
                          ? t('settings.reactShell.accountSigningIn', { defaultValue: 'Signing in...' })
                          : provider.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <p className="break-all text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.accountServer', { defaultValue: 'Auth service' })}
          {': '}
          {serverUrl}
        </p>
      </div>
    </section>
  )
}
