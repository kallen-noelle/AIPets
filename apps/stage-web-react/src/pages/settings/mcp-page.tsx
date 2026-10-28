import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, TextField, ToggleField } from '../../components/fields'
import { mcpEnabledKey, mcpUrlKey, refreshMcpTools } from '../../mcp/tools'
import { useStoredValue } from '../../settings/persisted'

const commandKey = 'settings/mcp/server-cmd'
const argsKey = 'settings/mcp/server-args'

export function McpPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useStoredValue(mcpEnabledKey, false)
  const [url, setUrl] = useStoredValue(mcpUrlKey, '')
  const [command, setCommand] = useStoredValue(commandKey, '')
  const [args, setArgs] = useStoredValue(argsKey, '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ tools: number, error?: string } | null>(null)

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      const next = await refreshMcpTools(true)
      setResult(next)
    }
    finally {
      setTesting(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.mcp-server.title', { defaultValue: 'MCP servers' })}
        description={t('settings.pages.modules.mcp-server.description', { defaultValue: '' })}
      />

      <SectionCard
        title={t('settings.reactShell.mcpBrowserTitle', { defaultValue: 'Browser connection' })}
        description={t('settings.reactShell.mcpBrowserHint', {
          defaultValue: 'The browser app reaches an MCP server through its streamable HTTP URL. The tools appear in chat after a successful test.',
        })}
      >
        <ToggleField
          label={t('settings.reactShell.mcpEnable', { defaultValue: 'Use this MCP server' })}
          checked={enabled}
          onChange={setEnabled}
        />

        <TextField
          label={t('settings.reactShell.mcpUrl', { defaultValue: 'Server URL' })}
          description={t('settings.reactShell.mcpUrlHint', {
            defaultValue: 'For example https://example.com/mcp. The server must accept CORS from this page.',
          })}
          value={url}
          placeholder="https://example.com/mcp"
          onChange={setUrl}
        />

        <button
          type="button"
          className="self-start border border-[var(--aipets-border)] rounded-xl px-3 py-1.5 text-xs transition hover:bg-[var(--aipets-hover)] disabled:opacity-40"
          disabled={testing || !url.trim()}
          onClick={() => void test()}
        >
          <span className="i-solar:plug-circle-bold-duotone" />
          {' '}
          {testing
            ? t('settings.reactShell.mcpTesting', { defaultValue: 'Connecting...' })
            : t('settings.reactShell.mcpTest', { defaultValue: 'Test connection' })}
        </button>

        {result && (
          <p className={result.error ? 'text-xs text-rose-400' : 'text-xs text-[var(--aipets-muted)]'}>
            {result.error
              ? result.error
              : t('settings.reactShell.mcpToolsFound', {
                  defaultValue: '{{count}} tools are ready for chat.',
                  count: result.tools,
                })}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.mcpDesktopTitle', { defaultValue: 'Desktop launch command' })}
        description={t('settings.reactShell.mcpDesktopHint', {
          defaultValue: 'The desktop app can start a local server with this command. The browser app does not.',
        })}
      >
        <TextField
          label={t('settings.reactShell.mcpCommand', { defaultValue: 'Server command' })}
          description={t('settings.reactShell.mcpCommandHint', {
            defaultValue: 'For example npx, or the path of a local executable.',
          })}
          value={command}
          placeholder="npx"
          onChange={setCommand}
        />

        <TextField
          label={t('settings.reactShell.mcpArgs', { defaultValue: 'Arguments' })}
          description={t('settings.reactShell.mcpArgsHint', {
            defaultValue: 'Space separated. For example -y @modelcontextprotocol/server-filesystem.',
          })}
          value={args}
          onChange={setArgs}
        />
      </SectionCard>
    </section>
  )
}
