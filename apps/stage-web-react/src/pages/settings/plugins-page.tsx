import type { DesktopPlugin } from '../../desktop/bridge'

import { errorMessageFrom } from '@moeru/std'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard } from '../../components/fields'
import { getDesktopBridge } from '../../desktop/bridge'

const buttonClass = [
  'rounded-xl border border-[var(--airi-border)] px-3 py-1.5 text-xs transition',
  'hover:bg-[var(--airi-hover)] disabled:opacity-40',
].join(' ')

export function PluginsPage() {
  const { t } = useTranslation()
  const bridge = getDesktopBridge()

  const [plugins, setPlugins] = useState<DesktopPlugin[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!bridge)
      return
    setPlugins(await bridge.listPlugins())
  }, [bridge])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (id: string, action: () => Promise<DesktopPlugin[]>) => {
    setBusyId(id)
    setError(null)
    try {
      setPlugins(await action())
    }
    catch (cause) {
      setError(errorMessageFrom(cause) ?? 'unknown error')
    }
    finally {
      setBusyId(null)
    }
  }

  const install = async () => {
    if (!bridge)
      return

    setInstalling(true)
    setError(null)
    try {
      setPlugins(await bridge.installPlugin())
    }
    catch (cause) {
      setError(errorMessageFrom(cause) ?? 'unknown error')
    }
    finally {
      setInstalling(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.reactShell.pluginsTitle', { defaultValue: 'Plugins' })}
        description={t('settings.reactShell.pluginsDescription', {
          defaultValue: 'Install a local plugin folder, enable it, and open its window.',
        })}
      />

      {!bridge && (
        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.desktopBrowserHint', {
            defaultValue: 'These controls need the desktop app. This page runs in a browser tab now.',
          })}
        </p>
      )}

      {bridge && (
        <button type="button" className={`${buttonClass} self-start`} disabled={installing} onClick={() => void install()}>
          <span className="i-solar:folder-with-files-bold-duotone" />
          {' '}
          {t('settings.reactShell.installPlugin', { defaultValue: 'Install folder' })}
        </button>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {plugins.length === 0 && (
        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.noPlugins', { defaultValue: 'No plugins installed.' })}
        </p>
      )}

      {bridge && plugins.map((plugin) => {
        const busy = busyId === plugin.id

        return (
          <SectionCard key={plugin.id} title={`${plugin.name} · ${plugin.version}`}>
            <p className="text-xs text-[var(--airi-muted)]">
              {plugin.description || plugin.id}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => void run(plugin.id, () => bridge.setPluginEnabled(plugin.id, !plugin.enabled))}
              >
                {plugin.enabled
                  ? t('settings.reactShell.disablePlugin', { defaultValue: 'Disable' })
                  : t('settings.reactShell.enablePlugin', { defaultValue: 'Enable' })}
              </button>

              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => void run(plugin.id, () => bridge.removePlugin(plugin.id))}
              >
                {t('settings.reactShell.removePlugin', { defaultValue: 'Remove' })}
              </button>

              <span className="text-xs text-[var(--airi-muted)]">
                {plugin.enabled
                  ? t('settings.reactShell.pluginEnabled', { defaultValue: 'Enabled' })
                  : t('settings.reactShell.pluginDisabled', { defaultValue: 'Disabled' })}
              </span>
            </div>

            {plugin.error && <p className="text-xs text-rose-400">{plugin.error}</p>}

            {plugin.bindings.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold">
                  {t('settings.reactShell.pluginBindings', { defaultValue: 'Gamelet windows' })}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {plugin.bindings.map(binding => (
                    <button
                      key={binding.moduleId}
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => void run(plugin.id, async () => {
                        await bridge.openPluginBinding(plugin.id, binding.moduleId)
                        return bridge.listPlugins()
                      })}
                    >
                      {binding.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {plugin.logs.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-[var(--airi-muted)]">
                  {t('settings.reactShell.pluginLogs', { defaultValue: 'Logs' })}
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-[11px] text-[var(--airi-muted)]">
                  {plugin.logs.map(log => (
                    <li key={`${log.at}-${log.message}`}>
                      {new Date(log.at).toLocaleTimeString()}
                      {' · '}
                      {log.level}
                      {' · '}
                      {log.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </SectionCard>
        )
      })}
    </section>
  )
}
