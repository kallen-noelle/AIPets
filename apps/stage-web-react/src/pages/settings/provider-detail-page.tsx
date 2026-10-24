import type { ProviderDefinition } from '@proj-airi/provider-inference'

import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { removeProvider, updateProviderConfig, useProviders } from '../../providers/store'

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

const inputClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
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

  const translate = (key: string) => String(t(key, { defaultValue: key }))

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
        <p className="text-sm text-[var(--airi-muted)]">Provider not found.</p>
        <Link to="/settings/providers" className="text-sm underline">Back to providers</Link>
      </section>
    )
  }

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

    updateProviderConfig(provider.id, result.data as Record<string, unknown>)
    setIssues([])
    void navigate('/settings/providers')
  }

  const remove = () => {
    removeProvider(provider.id)
    void navigate('/settings/providers')
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link to="/settings/providers" className="text-xs text-[var(--airi-muted)] hover:underline">
          {t('settings.reactShell.backToProviders', { defaultValue: 'Back to providers' })}
        </Link>
        <h1 className="text-2xl font-semibold">{definition.nameLocalize({ t: translate })}</h1>
        <p className="text-sm text-[var(--airi-muted)]">
          {definition.descriptionLocalize({ t: translate })}
        </p>
      </header>

      <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
        {fields.map(({ key, meta }) => {
          const value = config[key]

          if (meta.type === 'boolean') {
            return (
              <label key={key} className="flex items-center justify-between gap-4 text-sm">
                <span>{meta.labelLocalized ?? key}</span>
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
                <span>{meta.labelLocalized ?? key}</span>
                <select
                  className={inputClass}
                  value={typeof value === 'string' ? value : ''}
                  disabled={meta.disabled}
                  onChange={event => setField(key, event.target.value)}
                >
                  {meta.options.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label ?? option.value}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          return (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span>{meta.labelLocalized ?? key}</span>
              <input
                className={inputClass}
                type={meta.type === 'password' ? 'password' : 'text'}
                value={typeof value === 'string' ? value : ''}
                placeholder={meta.placeholderLocalized}
                disabled={meta.disabled}
                onChange={event => setField(key, event.target.value)}
              />
              {meta.descriptionLocalized && (
                <span className="text-xs text-[var(--airi-muted)]">{meta.descriptionLocalized}</span>
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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-[var(--airi-fg)] px-5 py-2 text-sm text-[var(--airi-bg)] font-medium"
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
