import type { AssetCacheStats } from '../../animation/asset-cache'
import type { PackMeta } from '../../animation/zip-pack'
import type { BuiltinCharacter, CharacterAppearance } from '../../character/characters'
import type { CharacterInstance } from '../../character/instances'

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
  characterPreviewUrl,
  defaultCharacterAppearance,
  loadBuiltinCharacters,
} from '../../character/characters'
import {
  createInstance,
  ensureDefaultInstance,
  instanceNumber,
  instancesOfCharacter,
  useCharacterInstances,
} from '../../character/instances'
import { SliderField, ToggleField } from '../../components/fields'

const buttonClass = [
  'rounded-full border border-[var(--aipets-border)] px-4 py-1.5 text-xs',
  'transition hover:bg-[var(--aipets-hover)]',
].join(' ')

const numberButtonClass = [
  'h-7 min-w-7 rounded-full border px-2 text-xs transition',
  'border-[var(--aipets-border)] hover:bg-[var(--aipets-hover)]',
].join(' ')

const numberButtonActiveClass = [
  'h-7 min-w-7 rounded-full border px-2 text-xs transition',
  'border-[var(--aipets-fg)] bg-[var(--aipets-fg)] text-[var(--aipets-bg)]',
].join(' ')

/** Edits the look of one instance. The values stay with that instance. */
function InstanceAppearance({ instance, onChange, onReset }: {
  instance: CharacterInstance
  onChange: (patch: Partial<CharacterAppearance>) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const { appearance } = instance

  return (
    <div className="flex flex-col gap-3">
      <SliderField
        label={t('settings.reactShell.scale', { defaultValue: 'Scale' })}
        value={appearance.scale}
        min={0.4}
        max={2}
        step={0.05}
        onChange={value => onChange({ scale: value })}
      />
      <SliderField
        label={t('settings.reactShell.fade', { defaultValue: 'Fade (ms)' })}
        value={appearance.fadeMs}
        min={0}
        max={1200}
        step={20}
        onChange={value => onChange({ fadeMs: value })}
      />
      <ToggleField
        label={t('settings.reactShell.mirror', { defaultValue: 'Mirror' })}
        checked={appearance.mirror}
        onChange={value => onChange({ mirror: value })}
      />
      <ToggleField
        label={t('settings.reactShell.clickEnabled', { defaultValue: 'React to clicks' })}
        checked={appearance.clickEnabled}
        onChange={value => onChange({ clickEnabled: value })}
      />
      <button
        type="button"
        className="self-start text-xs text-[var(--aipets-muted)] hover:text-rose-400"
        onClick={onReset}
      >
        {t('settings.reactShell.resetAppearance', { defaultValue: 'Reset appearance' })}
      </button>
    </div>
  )
}

export function ModelsPage() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [packs, setPacks] = useState<PackMeta[]>([])
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [cache, setCache] = useState<AssetCacheStats | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)
  const [instances, setInstances] = useCharacterInstances()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setPacks(listPackMeta())
    setActiveId(getActivePackId())
  }, [])

  useEffect(() => {
    refresh()

    let disposed = false

    void readAssetCacheStats().then((stats) => {
      if (!disposed)
        setCache(stats)
    })

    // The first visit creates the default pet instance.
    void ensureDefaultInstance()

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
    setActiveId(id)
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

  const setEnabled = (id: string, enabled: boolean) => {
    setInstances(instances.map(instance => instance.id === id ? { ...instance, enabled } : instance))
  }

  const addInstance = (character: BuiltinCharacter) => {
    const instance = createInstance(character)
    setInstances([...instances, instance])
    setSelectedId(instance.id)
  }

  const removeInstance = (id: string) => {
    setInstances(instances.filter(instance => instance.id !== id))

    if (selectedId === id)
      setSelectedId(null)
  }

  const patchInstance = (id: string, patch: Partial<CharacterAppearance>) => {
    setInstances(instances.map(instance => instance.id === id
      ? { ...instance, appearance: { ...instance.appearance, ...patch } }
      : instance))
  }

  const resetInstance = (id: string, appearance: CharacterAppearance) => {
    setInstances(instances.map(instance => instance.id === id
      ? { ...instance, appearance: { ...appearance } }
      : instance))
  }

  // The shared settings edit one instance. Another card can pick it too.
  const current = instances.find(instance => instance.id === selectedId) ?? instances[0] ?? null
  const currentCharacter = current
    ? characters.find(character => character.id === current.characterId) ?? null
    : null
  const currentAppearance = currentCharacter?.appearance ?? defaultCharacterAppearance

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
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">
              {t('settings.reactShell.characterList', { defaultValue: 'Character list' })}
            </h2>
            <p className="text-xs text-[var(--aipets-muted)]">
              {t('settings.reactShell.characterListDescription', {
                defaultValue: 'Characters load from the generated asset index.',
              })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {characters.map((character) => {
              const preview = characterPreviewUrl(character)
              const numbered = instancesOfCharacter(instances, character.id)
              const shown = numbered.some(entry => entry.instance.enabled)

              return (
                <div
                  key={character.id}
                  className={[
                    'flex flex-col gap-3 rounded-2xl border p-4 transition',
                    shown
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
                    {shown && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                        {t('settings.reactShell.enabled', { defaultValue: 'Enabled' })}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: character.accent }}>{character.role}</span>
                    <p className="text-xs text-[var(--aipets-muted)]">{character.description}</p>
                    <span className="text-xs text-[var(--aipets-muted)]">
                      {t('settings.reactShell.clipCount', {
                        defaultValue: '{{count}} clips',
                        count: character.clipCount,
                      })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {numbered.map(({ instance, number }) => (
                      <button
                        key={instance.id}
                        type="button"
                        className={instance.id === current?.id ? numberButtonActiveClass : numberButtonClass}
                        onClick={() => setSelectedId(instance.id)}
                      >
                        {number}
                      </button>
                    ))}

                    <button type="button" className={buttonClass} onClick={() => addInstance(character)}>
                      {t('settings.reactShell.addInstance', { defaultValue: 'Add instance' })}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.instancePickHint', { defaultValue: 'Pick a number to edit that instance.' })}
          </p>

          {current && currentCharacter && (
            <div className="flex flex-col gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                  {t('settings.reactShell.instanceSettings', { defaultValue: 'Instance settings' })}
                </h2>
                <span className="text-xs text-[var(--aipets-muted)]">
                  {t('settings.reactShell.instanceLabel', {
                    defaultValue: 'Instance {{number}} · {{name}}',
                    number: instanceNumber(instances, current),
                    name: currentCharacter.name,
                  })}
                </span>
              </div>

              <InstanceAppearance
                key={current.id}
                instance={current}
                onChange={patch => patchInstance(current.id, patch)}
                onReset={() => resetInstance(current.id, currentAppearance)}
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--aipets-border)] pt-3">
                <button
                  type="button"
                  className="text-xs text-[var(--aipets-muted)] transition hover:text-rose-400"
                  onClick={() => removeInstance(current.id)}
                >
                  {t('settings.reactShell.deleteInstance', { defaultValue: 'Delete instance' })}
                </button>

                <button
                  type="button"
                  className={[
                    'rounded-full px-4 py-1.5 text-xs transition',
                    current.enabled
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'border border-[var(--aipets-border)] hover:bg-[var(--aipets-hover)]',
                  ].join(' ')}
                  onClick={() => setEnabled(current.id, !current.enabled)}
                >
                  {current.enabled
                    ? t('settings.reactShell.disableInstance', { defaultValue: 'Disable this instance' })
                    : t('settings.reactShell.enableInstance', { defaultValue: 'Enable this instance' })}
                </button>
              </div>
            </div>
          )}
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
