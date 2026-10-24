import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, TextField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

const commandKey = 'settings/mcp/server-cmd'
const argsKey = 'settings/mcp/server-args'

export function McpPage() {
  const { t } = useTranslation()
  const [command, setCommand] = useStoredValue(commandKey, '')
  const [args, setArgs] = useStoredValue(argsKey, '')

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.mcp-server.title', { defaultValue: 'MCP servers' })}
        description={t('settings.pages.modules.mcp-server.description', { defaultValue: '' })}
      />

      <SectionCard>
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

        <p className="text-xs text-[var(--airi-muted)]">
          {t('settings.reactShell.mcpNote', {
            defaultValue: 'The React app stores this config. MCP tools load only in the desktop app.',
          })}
        </p>
      </SectionCard>
    </section>
  )
}
