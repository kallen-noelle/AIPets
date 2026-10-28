import type { ChatSession } from '../../chat/sessions'

import { errorMessageFrom } from '@moeru/std'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { chatActiveSessionKey, chatSessionsKey } from '../../chat/sessions'
import { resetProviders } from '../../providers/store'
import { readStored, writeStored } from '../../settings/persisted'

const exportFormat = 'aipets-react-chat-sessions:v1'

type ConfirmTarget = 'chats' | 'providers' | 'all'

const buttonClass = [
  'rounded-full border border-[var(--aipets-border)] px-4 py-1.5 text-xs transition',
  'hover:bg-[var(--aipets-hover)] disabled:opacity-40',
].join(' ')

const dangerClass = [
  'rounded-full border border-rose-400/40 px-4 py-1.5 text-xs text-rose-300 transition',
  'hover:bg-rose-500/10',
].join(' ')

function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== 'object')
    return false

  const session = value as Partial<ChatSession>
  return typeof session.id === 'string' && Array.isArray(session.messages)
}

function parseSessions(payload: unknown): ChatSession[] | null {
  const raw = Array.isArray(payload)
    ? payload
    : (payload as { format?: string, sessions?: unknown })?.format === exportFormat
        ? (payload as { sessions?: unknown }).sessions
        : null

  if (!Array.isArray(raw) || !raw.every(isChatSession))
    return null

  return raw
}

export function DataPage() {
  const { t } = useTranslation()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error', text: string } | null>(null)
  const [confirming, setConfirming] = useState<ConfirmTarget | null>(null)

  const report = (tone: 'ok' | 'error', text: string) => setStatus({ tone, text })

  const exportChats = () => {
    const sessions = readStored<ChatSession[]>(chatSessionsKey, [])
    const blob = new Blob([JSON.stringify({ format: exportFormat, exportedAt: Date.now(), sessions }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `aipets-react-chats-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    report('ok', t('settings.reactShell.dataExported', { defaultValue: 'Chats exported.' }))
  }

  const importChats = async (file: File | undefined) => {
    if (!file)
      return

    try {
      const parsed = parseSessions(JSON.parse(await file.text()))
      if (!parsed)
        throw new Error('Invalid chat export')

      writeStored(chatSessionsKey, parsed)
      writeStored(chatActiveSessionKey, parsed[0]?.id ?? '')
      report('ok', t('settings.reactShell.dataImported', { defaultValue: 'Chats imported.' }))
    }
    catch (cause) {
      report('error', errorMessageFrom(cause) ?? 'Import failed')
    }
  }

  const deleteChats = () => {
    writeStored(chatSessionsKey, [])
    writeStored(chatActiveSessionKey, '')
    setConfirming(null)
    report('ok', t('settings.reactShell.dataChatsDeleted', { defaultValue: 'All chats deleted.' }))
  }

  const resetProviderSettings = () => {
    resetProviders()
    setConfirming(null)
    report('ok', t('settings.reactShell.dataProvidersReset', { defaultValue: 'Provider settings reset.' }))
  }

  const deleteAll = () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('aipets:react:'))
        localStorage.removeItem(key)
    }

    setConfirming(null)
    report('ok', t('settings.reactShell.dataAllDeleted', { defaultValue: 'React app data deleted.' }))
  }

  const renderConfirm = (target: ConfirmTarget, action: () => void, label: string) => (
    confirming === target
      ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={dangerClass} onClick={action}>
              {t('settings.reactShell.confirmYes', { defaultValue: 'Yes, delete' })}
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirming(null)}>
              {t('settings.reactShell.confirmNo', { defaultValue: 'Cancel' })}
            </button>
          </div>
        )
      : (
          <button type="button" className={buttonClass} onClick={() => setConfirming(target)}>
            {label}
          </button>
        )
  )

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.data.title', { defaultValue: 'Data' })}
        </h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.reactShell.dataDescription', {
            defaultValue: 'Export, import, and delete the data this app stores in the browser.',
          })}
        </p>
      </header>

      {status && (
        <p className={status.tone === 'ok' ? 'text-sm text-emerald-400' : 'text-sm text-rose-400'}>
          {status.text}
        </p>
      )}

      <div className="flex flex-col gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
        <div>
          <h2 className="text-sm font-semibold">
            {t('settings.reactShell.dataChatsTitle', { defaultValue: 'Chats' })}
          </h2>
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.dataChatsDescription', {
              defaultValue: 'Every chat session lives in this browser. Export a JSON file to back it up.',
            })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={exportChats}>
            {t('settings.reactShell.dataExport', { defaultValue: 'Export' })}
          </button>
          <button type="button" className={buttonClass} onClick={() => importInputRef.current?.click()}>
            {t('settings.reactShell.dataImport', { defaultValue: 'Import' })}
          </button>
          {renderConfirm(
            'chats',
            deleteChats,
            t('settings.reactShell.dataDeleteChats', { defaultValue: 'Delete chats' }),
          )}
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            void importChats(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      <div className="flex flex-col gap-3 border border-rose-400/20 rounded-2xl bg-rose-500/5 p-4">
        <div>
          <h2 className="text-sm text-rose-300 font-semibold">
            {t('settings.reactShell.dataDangerTitle', { defaultValue: 'Danger zone' })}
          </h2>
          <p className="text-xs text-rose-200/70">
            {t('settings.reactShell.dataDangerDescription', {
              defaultValue: 'These actions cannot be undone.',
            })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs">
            {t('settings.reactShell.dataProvidersTitle', { defaultValue: 'Provider settings' })}
          </span>
          {renderConfirm(
            'providers',
            resetProviderSettings,
            t('settings.reactShell.dataResetProviders', { defaultValue: 'Reset providers' }),
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs">
            {t('settings.reactShell.dataAllTitle', { defaultValue: 'All React app data' })}
          </span>
          {renderConfirm(
            'all',
            deleteAll,
            t('settings.reactShell.dataDeleteAll', { defaultValue: 'Delete all data' }),
          )}
        </div>
      </div>
    </section>
  )
}
