import type { PackMeta } from '../../animation/zip-pack'

import { errorMessageFrom } from '@moeru/std'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getActivePackId,
  importPack,
  listPackMeta,
  removePack,
  setActivePackId,
} from '../../animation/zip-pack'

const buttonClass = [
  'rounded-full border border-[var(--airi-border)] px-4 py-1.5 text-xs',
  'transition hover:bg-[var(--airi-hover)]',
].join(' ')

export function ModelsPage() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [packs, setPacks] = useState<PackMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const refresh = useCallback(() => {
    setPacks(listPackMeta())
    setActiveId(getActivePackId())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const onImport = async (file: File | undefined) => {
    if (!file)
      return

    setImporting(true)
    setError(null)

    try {
      await importPack(file)
      refresh()
    }
    catch (cause) {
      setError(errorMessageFrom(cause) ?? 'Import failed')
    }
    finally {
      setImporting(false)
      if (inputRef.current)
        inputRef.current.value = ''
    }
  }

  const activate = (id: string) => {
    setActivePackId(id)
    setActiveId(id)
  }

  const remove = async (id: string) => {
    await removePack(id)
    refresh()
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.models.title', { defaultValue: 'Models' })}
        </h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {t('settings.reactShell.modelsDescription', {
            defaultValue: 'Transparent video animation packs replace the old Live2D and VRM models.',
          })}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={event => void onImport(event.target.files?.[0])}
        />

        <button
          type="button"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-[var(--airi-fg)] px-5 py-2 text-sm text-[var(--airi-bg)] font-medium disabled:opacity-50"
        >
          {importing
            ? t('settings.reactShell.importing', { defaultValue: 'Importing...' })
            : t('settings.reactShell.importPack', { defaultValue: 'Import pack (.zip)' })}
        </button>

        <span className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.importHint', {
            defaultValue: 'The ZIP must contain a manifest.json and its clip files.',
          })}
        </span>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {packs.length === 0
        ? (
            <div className="border border-[var(--airi-border)] rounded-2xl border-dashed p-6 text-center text-sm text-[var(--airi-muted)]">
              {t('settings.reactShell.noPacks', { defaultValue: 'No animation packs installed yet.' })}
            </div>
          )
        : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {packs.map((pack) => {
                const active = pack.id === activeId

                return (
                  <div
                    key={pack.id}
                    className={[
                      'flex flex-col gap-3 rounded-2xl border p-4 transition',
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/5'
                        : 'border-[var(--airi-border)] bg-[var(--airi-card)]',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{pack.name}</span>
                      {active && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                          {t('settings.reactShell.active', { defaultValue: 'Active' })}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-[var(--airi-muted)]">
                      <span>
                        {t('settings.reactShell.canvas', { defaultValue: 'Canvas' })}
                        {': '}
                        {pack.canvas.width}
                        {' × '}
                        {pack.canvas.height}
                      </span>
                      <span>
                        {t('settings.reactShell.clips', { defaultValue: 'Clips' })}
                        {': '}
                        {pack.clipCount}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!active && (
                        <button type="button" className={buttonClass} onClick={() => activate(pack.id)}>
                          {t('settings.reactShell.setActive', { defaultValue: 'Set active' })}
                        </button>
                      )}
                      <button type="button" className={buttonClass} onClick={() => void remove(pack.id)}>
                        {t('settings.reactShell.remove', { defaultValue: 'Remove' })}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
    </section>
  )
}
