import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

/**
 * Placeholder for a Vue page that has no React port yet.
 *
 * The route exists, so a link to it no longer falls through the router. The
 * page only states that the port is pending.
 */
export function PendingPage({ title }: { title?: string }) {
  const { t } = useTranslation()
  const location = useLocation()

  const segment = title ?? location.pathname.split('/').filter(Boolean).pop() ?? 'page'
  const heading = t(`settings.reactShell.pending.${segment}`, { defaultValue: segment })

  return (
    <section className="mx-auto max-w-2xl min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold capitalize">{heading}</h1>
      <p className="text-sm text-[var(--aipets-muted)]">
        {t('settings.reactShell.pendingDescription', {
          defaultValue: 'This page has no React version yet. The route exists so links reach a page.',
        })}
      </p>
      <Link to="/" className="text-sm underline">
        {t('settings.reactShell.pendingBack', { defaultValue: 'Back to the stage' })}
      </Link>
    </section>
  )
}
