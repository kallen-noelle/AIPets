import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useStoredValue } from '../../settings/persisted'

export const websocketUrlKey = 'settings/connection/websocket-url'
export const websocketTokenKey = 'settings/connection/websocket-auth-token'

const defaultWebSocketUrl = import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws'

type CheckStatus = 'idle' | 'checking' | 'connected' | 'failed'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

const buttonClass = [
  'rounded-full border border-[var(--airi-border)] px-4 py-1.5 text-xs transition',
  'hover:bg-[var(--airi-hover)] disabled:opacity-40',
].join(' ')

export function ConnectionPage() {
  const { t } = useTranslation()
  const [url, setUrl] = useStoredValue(websocketUrlKey, defaultWebSocketUrl)
  const [token, setToken] = useStoredValue(websocketTokenKey, '')
  const [status, setStatus] = useState<CheckStatus>('idle')
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  const check = () => {
    socketRef.current?.close()
    socketRef.current = null
    setStatus('checking')

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    }
    catch {
      setStatus('failed')
      return
    }

    socketRef.current = socket
    const timer = window.setTimeout(() => {
      socket.close()
      setStatus('failed')
    }, 6000)

    socket.addEventListener('open', () => {
      window.clearTimeout(timer)
      setStatus('connected')
    })

    socket.addEventListener('error', () => {
      window.clearTimeout(timer)
      setStatus('failed')
    })

    socket.addEventListener('close', () => {
      window.clearTimeout(timer)
      setStatus(current => (current === 'connected' ? current : 'failed'))
      socketRef.current = null
    })
  }

  const labels: Record<CheckStatus, string> = {
    idle: t('settings.reactShell.connectionIdle', { defaultValue: 'Not checked yet.' }),
    checking: t('settings.reactShell.connectionChecking', { defaultValue: 'Checking...' }),
    connected: t('settings.reactShell.connectionConnected', { defaultValue: 'Connected.' }),
    failed: t('settings.reactShell.connectionFailed', { defaultValue: 'Cannot connect to this address.' }),
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.connection.title', { defaultValue: 'Connection' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.connectionDescription', {
            defaultValue: 'The WebSocket server that relays events between modules.',
          })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.connectionUrl', { defaultValue: 'Server address' })}</span>
          <input
            className={fieldClass}
            value={url}
            placeholder={defaultWebSocketUrl}
            onChange={event => setUrl(event.target.value)}
          />
          <span className="text-xs text-[var(--airi-muted)]">
            {t('settings.reactShell.connectionUrlHint', {
              defaultValue: 'Use ws:// or wss://. The default is ws://localhost:6121/ws.',
            })}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('settings.reactShell.connectionToken', { defaultValue: 'Auth token (optional)' })}</span>
          <input
            className={fieldClass}
            type="password"
            value={token}
            onChange={event => setToken(event.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={buttonClass} disabled={status === 'checking'} onClick={check}>
            {t('settings.reactShell.connectionTest', { defaultValue: 'Test connection' })}
          </button>

          <span className={[
            'text-xs',
            status === 'connected'
              ? 'text-emerald-400'
              : status === 'failed'
                ? 'text-rose-400'
                : 'text-[var(--airi-muted)]',
          ].join(' ')}
          >
            {labels[status]}
          </span>
        </div>
      </div>
    </section>
  )
}
