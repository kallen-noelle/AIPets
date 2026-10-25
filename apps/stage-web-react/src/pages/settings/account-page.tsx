import { useTranslation } from 'react-i18next'

export function AccountPage() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.account.title', { defaultValue: 'Account' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.accountDescription', { defaultValue: '' })}
        </p>
      </header>

      <div className="border border-[var(--airi-border)] rounded-2xl border-dashed bg-[var(--airi-card)] p-6">
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.accountUnavailable', {
            defaultValue: 'Sign-in is not available yet. Local features keep working.',
          })}
        </p>
      </div>
    </section>
  )
}
