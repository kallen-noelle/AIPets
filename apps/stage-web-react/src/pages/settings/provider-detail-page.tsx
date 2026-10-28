import type { ProviderDefinition } from '@proj-airi/provider-inference'

import { errorMessageFrom } from '@moeru/std'
import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { removeProvider, updateProviderConfig, useProviders } from '../../providers/store'
import { activeProviderKeys, groupsOfDefinition } from '../../providers/tasks'
import { speak, speakLocally } from '../../speech/playback'

interface FieldMeta {
  type?: string
  labelLocalized?: string
  descriptionLocalized?: string
  placeholderLocalized?: string
  disabled?: boolean
  options?: Array<{ label?: string, value?: string }>
}

interface SchemaIssue {
  message: string
  path?: Array<{ key: string | number }>
}

interface SchemaResult {
  success: boolean
  data?: unknown
  error?: { issues: SchemaIssue[] }
}

interface SchemaLike {
  shape?: Record<string, unknown>
  safeParse: (input: unknown) => SchemaResult
}

/** Narrows a provider schema without discarding the zod type at the call site. */
function toSchemaLike(value: unknown): SchemaLike | null {
  if (!value || typeof value !== 'object')
    return null

  const candidate = value as { safeParse?: unknown, shape?: unknown }
  if (typeof candidate.safeParse !== 'function')
    return null

  return {
    shape: candidate.shape as SchemaLike['shape'],
    safeParse: candidate.safeParse as SchemaLike['safeParse'],
  }
}

function readMeta(field: unknown): FieldMeta {
  if (!field || typeof field !== 'object')
    return {}

  const candidate = field as { meta?: unknown }
  if (typeof candidate.meta !== 'function')
    return {}

  return (candidate.meta as () => FieldMeta)() ?? {}
}

function readActiveProviders(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [group, key] of Object.entries(activeProviderKeys)) {
    const value = localStorage.getItem(key)
    if (value)
      result[group] = value
  }
  return result
}

const inputClass = [
  'w-full rounded-xl border border-[var(--aipets-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--aipets-fg)]',
].join(' ')

const secondaryButtonClass = [
  'rounded-full border border-[var(--aipets-border)] px-4 py-1.5 text-xs',
  'transition hover:bg-[var(--aipets-hover)] disabled:opacity-40',
].join(' ')

export function ProviderDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { providerId } = useParams()
  const providers = useProviders()

  const provider = providerId ? providers[providerId] : undefined
  const definition: ProviderDefinition | undefined = provider
    ? portableProviderDefinitions.find(item => item.id === provider.definitionId)
    : undefined

  const [schema, setSchema] = useState<SchemaLike | null>(null)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [issues, setIssues] = useState<string[]>([])
  const [active, setActive] = useState<Record<string, string>>(() => readActiveProviders())
  const [preview, setPreview] = useState('Hello, this is a voice preview.')
  const [previewing, setPreviewing] = useState(false)

  const translate = (key: string) => String(t(key, { defaultValue: key }))
  const localized = (key?: string) => (key ? String(t(key, { defaultValue: key })) : undefined)

  useEffect(() => {
    if (!definition || !provider)
      return

    setConfig(provider.config)

    let cancelled = false
    void Promise.resolve(
      definition.createProviderConfig({ t: translate, config: provider.config }),
    ).then((nextSchema) => {
      if (!cancelled)
        setSchema(toSchemaLike(nextSchema))
    })

    return () => {
      cancelled = true
    }
  }, [definition, provider])

  const fields = useMemo(() => {
    if (!schema?.shape)
      return []

    return Object.entries(schema.shape).map(([key, field]) => ({
      key,
      meta: readMeta(field),
    }))
  }, [schema])

  if (!provider || !definition) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-sm text-[var(--aipets-muted)]">Provider not found.</p>
        <Link to="/settings/providers" className="text-sm underline">Back to providers</Link>
      </section>
    )
  }

  const groups = groupsOfDefinition(provider.definitionId)

  const setField = (key: string, value: unknown) => {
    setConfig(current => ({ ...current, [key]: value }))
  }

  const save = () => {
    if (!schema) {
      setIssues([t('settings.reactShell.formNotReady', { defaultValue: 'Form is not ready' })])
      return
    }

    const result = schema.safeParse(config)
    if (!result.success) {
      setIssues((result.error?.issues ?? []).map(issue => issue.message))
      return
    }

    updateProviderConfig(provider.id, result.data as Record<string, unknown>, 'configured')
    setIssues([])
    void navigate('/settings/providers')
  }

  const activate = (group: (typeof groups)[number]) => {
    localStorage.setItem(activeProviderKeys[group], provider.id)
    setActive(current => ({ ...current, [group]: provider.id }))
    window.dispatchEvent(new StorageEvent('storage', { key: activeProviderKeys[group] }))
  }

  const previewVoice = async () => {
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.replace(/\/+$/, '') : ''
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey : ''
    const model = typeof config.model === 'string' ? config.model : ''
    const voice = typeof config.voice === 'string' ? config.voice : ''

    setPreviewing(true)
    setIssues([])
    try {
      if (baseUrl) {
        await speak(preview, { baseUrl, apiKey, model, voice })
      }
      else {
        await speakLocally(preview, {
          lang: navigator.language || 'en-US',
          voiceURI: '',
          rate: 1,
          pitch: 1,
        })
      }
    }
    catch (cause) {
      setIssues([errorMessageFrom(cause) ?? 'Voice preview failed'])
    }
    finally {
      setPreviewing(false)
    }
  }

  const remove = () => {
    removeProvider(provider.id)
    void navigate('/settings/providers')
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link to="/settings/providers" className="text-xs text-[var(--aipets-muted)] hover:underline">
          {t('settings.reactShell.backToProviders', { defaultValue: 'Back to providers' })}
        </Link>
        <h1 className="text-2xl font-semibold">{definition.nameLocalize({ t: translate })}</h1>
        <p className="text-sm text-[var(--aipets-muted)]">
          {definition.descriptionLocalize({ t: translate })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
        {fields.map(({ key, meta }) => {
          const value = config[key]
          const label = localized(meta.labelLocalized) ?? key

          if (meta.type === 'boolean') {
            return (
              <label key={key} className="flex items-center justify-between gap-4 text-sm">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={value === true}
                  disabled={meta.disabled}
                  onChange={event => setField(key, event.target.checked)}
                />
              </label>
            )
          }

          if (meta.type === 'select' && meta.options) {
            return (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span>{label}</span>
                <select
                  className={inputClass}
                  value={typeof value === 'string' ? value : ''}
                  disabled={meta.disabled}
                  onChange={event => setField(key, event.target.value)}
                >
                  {meta.options.map(option => (
                    <option key={option.value} value={option.value}>
                      {localized(option.label) ?? option.value}
                    </option>
                  ))}
                </select>
                {localized(meta.descriptionLocalized) && (
                  <span className="text-xs text-[var(--aipets-muted)]">{localized(meta.descriptionLocalized)}</span>
                )}
              </label>
            )
          }

          return (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span>{label}</span>
              <input
                className={inputClass}
                type={meta.type === 'password' ? 'password' : 'text'}
                value={typeof value === 'string' ? value : ''}
                placeholder={localized(meta.placeholderLocalized)}
                disabled={meta.disabled}
                onChange={event => setField(key, event.target.value)}
              />
              {localized(meta.descriptionLocalized) && (
                <span className="text-xs text-[var(--aipets-muted)]">{localized(meta.descriptionLocalized)}</span>
              )}
            </label>
          )
        })}

        {issues.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-rose-400">
            {issues.map(issue => <li key={issue}>{issue}</li>)}
          </ul>
        )}
      </div>

      {groups.includes('speech') && (
        <div className="flex flex-col gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
          <div>
            <h2 className="text-sm font-semibold">
              {t('settings.reactShell.voicePreview', { defaultValue: 'Voice preview' })}
            </h2>
            <p className="text-xs text-[var(--aipets-muted)]">
              {t('settings.reactShell.voicePreviewHint', {
                defaultValue: 'Uses the values in this form. Save after the preview works.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputClass} flex-1`}
              value={preview}
              onChange={event => setPreview(event.target.value)}
            />
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={previewing || !preview.trim()}
              onClick={() => void previewVoice()}
            >
              {previewing
                ? t('settings.reactShell.voicePreviewing', { defaultValue: 'Playing...' })
                : t('settings.reactShell.voicePreviewPlay', { defaultValue: 'Play' })}
            </button>
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-3 border border-[var(--aipets-border)] rounded-2xl bg-[var(--aipets-card)] p-4">
          <div>
            <h2 className="text-sm font-semibold">
              {t('settings.reactShell.activeProvider', { defaultValue: 'Active provider' })}
            </h2>
            <p className="text-xs text-[var(--aipets-muted)]">
              {t('settings.reactShell.activeProviderHint', {
                defaultValue: 'The chat and the speech pages use the active provider of their kind.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {groups.map(group => (
              <button
                key={group}
                type="button"
                className={secondaryButtonClass}
                onClick={() => activate(group)}
              >
                {active[group] === provider.id ? '✓ ' : ''}
                {t(`settings.reactShell.providerGroup${group[0].toUpperCase()}${group.slice(1)}`, {
                  defaultValue: group,
                })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-[var(--aipets-fg)] px-5 py-2 text-sm text-[var(--aipets-bg)] font-medium"
        >
          {t('settings.reactShell.save', { defaultValue: 'Save' })}
        </button>
        <button
          type="button"
          onClick={remove}
          className="border border-rose-400/40 rounded-full px-5 py-2 text-sm text-rose-400"
        >
          {t('settings.reactShell.remove', { defaultValue: 'Remove' })}
        </button>
      </div>
    </section>
  )
}
