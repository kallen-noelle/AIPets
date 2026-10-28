import type { ChatToolDefinition } from '../chat/tools'
import type { McpToolInfo } from './client'

import { errorMessageFrom } from '@moeru/std'

import { readStored } from '../settings/persisted'
import { callMcpTool, openMcpSession, probeMcpServer } from './client'

export const mcpEnabledKey = 'settings/mcp/enabled'
export const mcpUrlKey = 'settings/mcp/url'

export interface McpRefreshResult {
  tools: number
  error?: string
}

let cachedTools: ChatToolDefinition[] = []
let cachedUrl = ''
let refreshInFlight: Promise<McpRefreshResult> | null = null

/** The MCP tools the last refresh produced. */
export function getMcpTools(): ChatToolDefinition[] {
  return cachedTools
}

function configuredServer(): { enabled: boolean, url: string } {
  const enabled = readStored(mcpEnabledKey, false)
  const url = readStored(mcpUrlKey, '').trim()
  return { enabled, url }
}

function toolName(name: string, used: Set<string>): string {
  const base = `mcp_${name.replace(/[^\w-]/g, '_')}`
  let candidate = base
  let index = 2
  while (used.has(candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  used.add(candidate)
  return candidate
}

function toToolDefinition(info: McpToolInfo, remoteName: string): ChatToolDefinition {
  return {
    name: remoteName,
    description: info.description || `Remote tool ${info.name} from an MCP server.`,
    parameters: info.inputSchema.type === 'object'
      ? info.inputSchema
      : { type: 'object', properties: {}, additionalProperties: false },
    run: async (args, signal) => {
      const { url } = configuredServer()
      if (!url)
        return 'MCP call failed: no server URL is set'

      const timeout = AbortSignal.timeout(20_000)
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
      const session = await openMcpSession(url, requestSignal)
      return await callMcpTool(session, info.name, args, requestSignal)
    },
  }
}

/**
 * Reloads the tools of the configured MCP server.
 *
 * The chat resolves tools synchronously, so it reads this cache. A refresh
 * runs before each chat turn and after the settings page saves a URL.
 */
export function refreshMcpTools(force = false): Promise<McpRefreshResult> {
  if (refreshInFlight)
    return refreshInFlight

  const { enabled, url } = configuredServer()
  if (!enabled || !url) {
    cachedTools = []
    cachedUrl = ''
    return Promise.resolve({ tools: 0 })
  }

  if (!force && url === cachedUrl && cachedTools.length)
    return Promise.resolve({ tools: cachedTools.length })

  const used = new Set<string>()
  refreshInFlight = probeMcpServer(url)
    .then((infos) => {
      cachedUrl = url
      cachedTools = infos.map(info => toToolDefinition(info, toolName(info.name, used)))
      return { tools: cachedTools.length }
    })
    .catch((cause: unknown) => {
      cachedTools = []
      cachedUrl = ''
      return { tools: 0, error: errorMessageFrom(cause) ?? 'Cannot reach the MCP server' }
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}
