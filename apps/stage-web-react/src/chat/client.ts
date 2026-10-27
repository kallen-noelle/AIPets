export type ChatContentPart
  = | { type: 'text', text: string }
    | { type: 'image_url', image_url: { url: string } }
    | { type: 'input_audio', input_audio: { data: string, format: string } }

/** A tool call as the provider sends it back. */
export interface ChatToolCallPayload {
  id: string
  type: 'function'
  function: { name: string, arguments: string }
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | ChatContentPart[] | null
  tool_calls?: ChatToolCallPayload[]
  tool_call_id?: string
}

/** A tool declaration in the OpenAI function-calling shape. */
export interface ChatToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatRequest {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatTurn[]
  tools?: ChatToolSchema[]
  signal?: AbortSignal
  /** Receives the exact JSON body sent to the provider. */
  onRequest?: (body: string) => void
  /** Receives the exact response body. A stream reports its SSE lines. */
  onResponse?: (body: string) => void
}

/** One tool call the model asked for. */
export interface ChatToolCall {
  id: string
  name: string
  /** Raw JSON string the model produced. */
  arguments: string
}

/** The result of one streamed turn: text plus any tool calls. */
export interface ChatReply {
  content: string
  toolCalls: ChatToolCall[]
}

interface CompletionChoice {
  message?: {
    content?: unknown
    tool_calls?: unknown
  }
  delta?: {
    content?: unknown
    tool_calls?: unknown
  }
}

interface CompletionResponse {
  choices?: CompletionChoice[]
  error?: { message?: unknown }
}

interface RawToolCallDelta {
  index?: number
  id?: string
  type?: string
  function?: { name?: string, arguments?: string }
}

function completionBody(request: ChatRequest, stream: boolean): string {
  return JSON.stringify({
    model: request.model,
    messages: request.messages,
    ...(request.tools?.length ? { tools: request.tools } : {}),
    ...(stream ? { stream: true } : {}),
  })
}

function errorFromPayload(payload: CompletionResponse, status: number): Error {
  const message = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${status}`
  return new Error(message)
}

/**
 * Calls an OpenAI-compatible chat completions endpoint without streaming.
 *
 * The animation director uses this path, because it needs the whole reply
 * before it validates a performance plan.
 */
export async function requestChatCompletion(request: ChatRequest): Promise<string> {
  const url = `${request.baseUrl.replace(/\/+$/, '')}/chat/completions`

  const body = completionBody(request, false)
  request.onRequest?.(body)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${request.apiKey}`,
    },
    body,
    signal: request.signal,
  })

  const raw = await response.text()
  request.onResponse?.(raw)

  let payload: CompletionResponse
  try {
    payload = JSON.parse(raw) as CompletionResponse
  }
  catch {
    throw new Error(`HTTP ${response.status}: the provider returned a non-JSON body`)
  }

  if (!response.ok)
    throw errorFromPayload(payload, response.status)

  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string')
    throw new Error('The provider returned no message content')

  return content
}

function readSseData(chunk: string): string[] {
  return chunk
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(Boolean)
}

/**
 * Streams one chat turn and reports each text delta.
 *
 * Servers split SSE events across chunk boundaries, so the buffer keeps the
 * trailing partial event until the next chunk arrives. Tool call fragments
 * arrive with an index and are merged per index.
 */
export async function streamChatTurn(
  request: ChatRequest,
  onDelta: (text: string) => void,
): Promise<ChatReply> {
  const url = `${request.baseUrl.replace(/\/+$/, '')}/chat/completions`

  const body = completionBody(request, true)
  request.onRequest?.(body)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${request.apiKey}`,
    },
    body,
    signal: request.signal,
  })

  if (!response.ok) {
    const raw = await response.text()
    request.onResponse?.(raw)
    let payload: CompletionResponse = {}
    try {
      payload = JSON.parse(raw) as CompletionResponse
    }
    catch {}
    throw errorFromPayload(payload, response.status)
  }

  // A provider can answer without a stream. Fall back to the buffered path.
  if (!response.body) {
    const text = await requestChatCompletion(request)
    return { content: text, toolCalls: [] }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''
  let full = ''
  const pending = new Map<number, ChatToolCall>()

  const consume = (data: string) => {
    if (data === '[DONE]')
      return

    const parsed = JSON.parse(data) as CompletionResponse
    if (typeof parsed.error?.message === 'string')
      throw new Error(parsed.error.message)

    const choice = parsed.choices?.[0]
    const delta = choice?.delta?.content
    if (typeof delta === 'string' && delta) {
      full += delta
      onDelta(delta)
    }

    const rawCalls = choice?.delta?.tool_calls
    if (!Array.isArray(rawCalls))
      return

    for (const raw of rawCalls) {
      if (typeof raw !== 'object' || raw === null)
        continue
      const fragment = raw as RawToolCallDelta
      const index = typeof fragment.index === 'number' ? fragment.index : 0
      const current = pending.get(index) ?? { id: '', name: '', arguments: '' }

      if (typeof fragment.id === 'string' && fragment.id)
        current.id = fragment.id
      if (typeof fragment.function?.name === 'string' && fragment.function.name)
        current.name += fragment.function.name
      if (typeof fragment.function?.arguments === 'string')
        current.arguments += fragment.function.arguments

      pending.set(index, current)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    const chunk = decoder.decode(value, { stream: true })
    raw += chunk
    buffer += chunk
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const event of events) {
      for (const data of readSseData(event))
        consume(data)
    }
  }

  request.onResponse?.(raw)

  const toolCalls: ChatToolCall[] = []
  for (const [index, call] of [...pending.entries()].sort(([a], [b]) => a - b)) {
    if (!call.name)
      continue
    toolCalls.push({
      id: call.id || `call_${index}`,
      name: call.name,
      arguments: call.arguments,
    })
  }

  return { content: full, toolCalls }
}
