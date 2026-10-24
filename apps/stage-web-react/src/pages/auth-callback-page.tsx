import { errorMessageFrom } from '@moeru/std'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { completeSignIn } from '../auth/oidc'

export function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const providerError = params.get('error_description') ?? params.get('error')

    if (providerError) {
      setError(providerError)
      return
    }

    if (!code || !state) {
      setError(t('settings.reactShell.accountCallbackMissingCode', {
        defaultValue: 'The sign-in callback has no code.',
      }))
      return
    }

    void completeSignIn(code, state)
      .then(() => navigate('/settings/account', { replace: true }))
      .catch((cause: unknown) => setError(errorMessageFrom(cause) ?? 'Sign-in failed'))
  }, [navigate, t])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--airi-bg)] p-6 text-[var(--airi-fg)]">
      <div className="max-w-md flex flex-col gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-6 text-center">
        <p className="text-sm">
          {error || t('settings.reactShell.accountCallbackWorking', { defaultValue: 'Signing in...' })}
        </p>

        {error && (
          <button
            type="button"
            className="border border-[var(--airi-border)] rounded-full px-4 py-1.5 text-xs hover:bg-[var(--airi-hover)]"
            onClick={() => navigate('/settings/account', { replace: true })}
          >
            {t('settings.reactShell.backToAccount', { defaultValue: 'Back to account' })}
          </button>
        )}
      </div>
    </div>
  )
}
