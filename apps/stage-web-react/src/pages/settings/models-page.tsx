import type { AssetCacheStats } from '../../animation/asset-cache'
import type { PackMeta } from '../../animation/zip-pack'
import type { BuiltinCharacter } from '../../character/characters'

import { errorMessageFrom } from '@moeru/std'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { clearAssetCache, readAssetCacheStats } from '../../animation/asset-cache'
import {
  getActivePackId,
  importPack,
  listPackMeta,
  removePack,
  setActivePackId,
} from '../../animation/zip-pack'
import {
  applyCharacterPersona,
  characterPreviewUrl,
  getActiveCharacterId,
  loadBuiltinCharacters,
  loadCharacterPersona,
  setActiveCharacterId as persistActiveCharacterId,
} from '../../character/characters'

const buttonClass = [
  'rounded-full border border-[var(--aipets-border)] px-4 py-1.5 text-xs',
  'transition hover:bg-[var(--aipets-hover)]',
].join(' ')

export function ModelsPage() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [packs, setPacks] = useState<PackMeta[]>([])
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [cache, setCache] = useState<AssetCacheStats | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)

  const refresh = useCallback(() => {
    setPacks(listPackMeta())
    setActiveId(getActivePackId())
    setActiveCharacterId(getActiveCharacterId())
  }, [])

  useEffect(() => {
    refresh()

    let disposed = false

    void readAssetCacheStats().then((stats) => {
      if (!disposed)
        setCache(stats)
    })

    void loadBuiltinCharacters()
      .then((next) => {
        if (!disposed)
          setCharacters(next)
      })
      .catch((cause: unknown) => {
        if (!disposed)
          setError(errorMessageFrom(cause) ?? 'Cannot load characters')
      })

    return () => {
      disposed = true
    }
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
    persistActiveCharacterId(null)
    setActiveId(id)
    setActiveCharacterId(null)
  }

  const activateCharacter = (character: BuiltinCharacter) => {
    persistActiveCharacterId(character.id)
    setActivePackId(null)
    setActiveCharacterId(character.id)
    setActiveId(null)
    setError(null)

    void loadCharacterPersona(character)
      .then((persona) => {
        if (persona)
          applyCharacterPersona(persona)
      })
      .catch((personaError: unknown) => {
        setError(errorMessageFrom(personaError) ?? 'Cannot load the character persona')
      })
  }

  const remove = async (id: string) => {
    await removePack(id)
    refresh()
  }

  const refreshCache = async () => {
    setCacheBusy(true)
    setCache(await readAssetCacheStats())
    setCacheBusy(false)
  }

  const clearCache = async () => {
    setCacheBusy(true)
    await clearAssetCache()
    setCache(await readAssetCacheStats())
    setCacheBusy(false)
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('settings.pages.models.title', { defaultValue: 'Models' })}
        </h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {t('settings.reactShell.modelsDescription', {
            defaultValue: 'Transparent video animation packs replace the old Live2D and VRM models.',
          })}
        </p>
      </header>

      {characters.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            {t('settings.reactShell.builtinCharacters', { defaultValue: 'Built-in characters' })}
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {characters.map((character) => {
              const active = character.id === activeCharacterId
              const preview = characterPreviewUrl(character)

              return (
                <div
                  key={character.id}
                  className={[
                    'flex flex-col gap-3 rounded-2xl border p-4 transition',
                    active
                      ? 'border-emerald-400/50 bg-emerald-500/5'
                      : 'border-[var(--aipets-border)] bg-[var(--aipets-card)]',
                  ].join(' ')}
                >
                  {preview && (
                    <img
                      src={preview}
                      alt={character.name}
                      className="h-32 w-full object-contain"
                      loading="lazy"
                    />
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{character.name}</span>
                    {active && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                        {t('settings.reactShell.active', { defaultValue: 'Active' })}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: character.accent }}>{character.role}</span>
                    <p className="text-xs text-[var(--aipets-muted)]">{character.description}</p>
                    <span className="text-xs text-[var(--aipets-muted)]">
                      {`${character.clipCount} 段动作`}
                    </span>
                  </div>

                  {!active && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={buttonClass} onClick={() => activateCharacter(character)}>
                        {t('settings.reactShell.setActive', { defaultValue: 'Set active' })}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <h2 className="text-sm font-medium">
        {t('settings.reactShell.importedPacks', { defaultValue: 'Imported packs' })}
      </h2>

      <div className="flex flex-wrap items-center gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
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
          className="rounded-full bg-[var(--aipets-fg)] px-5 py-2 text-sm text-[var(--aipets-bg)] font-medium disabled:opacity-50"
        >
          {importing
            ? t('settings.reactShell.importing', { defaultValue: 'Importing...' })
            : t('settings.reactShell.importPack', { defaultValue: 'Import pack (.zip)' })}
        </button>

        <span className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.importHint', {
            defaultValue: 'The ZIP needs manifest.json and clips. character.json is optional for name, role, and appearance.',
          })}
        </span>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {packs.length === 0
        ? (
            <div className="border border-[var(--aipets-border)] rounded-2xl border-dashed p-6 text-center text-sm text-[var(--aipets-muted)]">
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
                        : 'border-[var(--aipets-border)] bg-[var(--aipets-card)]',
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

                    {(pack.profile.role || pack.profile.description) && (
                      <div className="flex flex-col gap-1">
                        {pack.profile.role && (
                          <span className="text-xs" style={{ color: pack.profile.accent }}>{pack.profile.role}</span>
                        )}
                        {pack.profile.description && (
                          <p className="text-xs text-[var(--aipets-muted)]">{pack.profile.description}</p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-xs text-[var(--aipets-muted)]">
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

      <section className="flex flex-col gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">
            {t('settings.reactShell.assetCacheTitle', { defaultValue: 'Local asset storage' })}
          </h2>
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.assetCacheHint', {
              defaultValue: 'Clips of a pack served by a URL are kept on this device. The next start reads them from disk, and the pack works offline.',
            })}
          </p>
        </div>

        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.assetCacheEntries', { defaultValue: 'Cached files' })}
          {': '}
          {cache?.entries ?? 0}
          {' · '}
          {((cache?.bytes ?? 0) / 1024 / 1024).toFixed(1)}
          {' MB'}
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={cacheBusy} onClick={() => void refreshCache()}>
            {t('settings.reactShell.refreshCache', { defaultValue: 'Refresh' })}
          </button>
          <button type="button" className={buttonClass} disabled={cacheBusy} onClick={() => void clearCache()}>
            {t('settings.reactShell.clearAssetCache', { defaultValue: 'Clear cache' })}
          </button>
        </div>
      </section>
    </section>
  )
}
