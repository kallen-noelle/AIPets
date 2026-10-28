import { errorMessageFrom } from '@moeru/std'

/** One tool a remote MCP server offers. */
export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** One live MCP streamable HTTP session. */
export interface McpSession {
  url: string
  sessionId: string
  nextId: number
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number | string
  result?: unknown
  error?: { code?: number, message?: string }
}

interface McpToolListResult {
  tools?: unknown
}

interface McpToolCallResult {
  content?: unknown
  isError?: boolean
}

const PROTOCOL_VERSION = '2025-06-18'

function headersFor(sessionId: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'accept': 'application/json, text/event-stream',
    ...(sessionId
      ? {
          'mcp-session-id': sessionId,
          'mcp-protocol-version': PROTOCOL_VERSION,
        }
      : {}),
  }
}

/**
 * Reads one JSON-RPC message.
 *
 * The transport can answer with plain JSON or with an SSE stream. Both carry
 * the same message, so the SSE path takes the first data line.
 */
async function readMessage(response: Response): Promise<JsonRpcResponse> {
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()

  if (contentType.includes('text/event-stream')) {
    const line = text.split('\n').find(candidate => candidate.startsWith('data:'))
    if (!line)
      throw new Error('The MCP server returned an empty event stream')
    return JSON.parse(line.slice(5).trim()) as JsonRpcResponse
  }

  return JSON.parse(text) as JsonRpcResponse
}

function resultOrThrow(message: JsonRpcResponse): unknown {
  if (message.error)
    throw new Error(message.error.message ?? 'The MCP server returned an error')
  return message.result
}

/** Opens a session and completes the initialize handshake. */
export async function openMcpSession(url: string, signal?: AbortSignal): Promise<McpSession> {
  const response = await fetch(url, {
    method: 'POST',
    headers: headersFor(''),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'airi-react', version: '0.1.0' },
      },
    }),
    signal,
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200)
    throw new Error(`MCP initialize failed: HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const message = await readMessage(response)
  resultOrThrow(message)

  const sessionId = response.headers.get('mcp-session-id') ?? ''

  await fetch(url, {
    method: 'POST',
    headers: headersFor(sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    signal,
  }).catch(() => undefined)

  return { url, sessionId, nextId: 2 }
}

async function rpcRequest(
  session: McpSession,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const id = session.nextId
  session.nextId += 1

  const response = await fetch(session.url, {
    method: 'POST',
    headers: headersFor(session.sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal,
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200)
    throw new Error(`MCP ${method} failed: HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const message = await readMessage(response)
  if (message.id !== undefined && message.id !== id)
    throw new Error(`MCP ${method} answered id ${String(message.id)} instead of ${id}`)

  return resultOrThrow(message)
}

function toToolInfo(raw: unknown): McpToolInfo | null {
  if (typeof raw !== 'object' || raw === null)
    return null

  const entry = raw as { name?: unknown, description?: unknown, inputSchema?: unknown }
  if (typeof entry.name !== 'string' || !entry.name)
    return null

  const inputSchema = typeof entry.inputSchema === 'object' && entry.inputSchema !== null
    ? entry.inputSchema as Record<string, unknown>
    : { type: 'object', properties: {} }

  return {
    name: entry.name,
    description: typeof entry.description === 'string' ? entry.description : '',
    inputSchema,
  }
}

/** Lists the tools of one session. */
export async function listMcpTools(session: McpSession, signal?: AbortSignal): Promise<McpToolInfo[]> {
  const result = await rpcRequest(session, 'tools/list', {}, signal) as McpToolListResult
  if (!Array.isArray(result?.tools))
    return []

  return result.tools.flatMap((raw) => {
    const tool = toToolInfo(raw)
    return tool ? [tool] : []
  })
}

function readTextContent(result: McpToolCallResult): string {
  if (!Array.isArray(result.content))
    return JSON.stringify(result)

  const parts = result.content.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null)
      return []
    const item = raw as { type?: unknown, text?: unknown }
    if (item.type === 'text' && typeof item.text === 'string')
      return [item.text]
    return []
  })

  return parts.length ? parts.join('\n') : JSON.stringify(result)
}

/** Calls one tool and returns its text result. */
export async function callMcpTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const result = await rpcRequest(session, 'tools/call', { name, arguments: args }, signal) as McpToolCallResult
  const text = readTextContent(result)
  return result.isError ? `MCP tool error: ${text}` : text
}

/** Loads the tool list of a server in one short session. */
export async function probeMcpServer(url: string): Promise<McpToolInfo[]> {
  const timeout = AbortSignal.timeout(20_000)
  try {
    const session = await openMcpSession(url, timeout)
    return await listMcpTools(session, timeout)
  }
  catch (cause) {
    throw new Error(errorMessageFrom(cause) ?? 'The MCP server is not reachable')
  }
}
