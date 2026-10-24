export type ChatContentPart
  = | { type: 'text', text: string }
    | { type: 'image_url', image_url: { url: string } }
    | { type: 'input_audio', input_audio: { data: string, format: string } }

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

export interface ChatRequest {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatTurn[]
  signal?: AbortSignal
}

interface CompletionChoice {
  message?: { content?: unknown }
  delta?: { content?: unknown }
}

interface CompletionResponse {
  choices?: CompletionChoice[]
  error?: { message?: unknown }
}

/**
 * Calls an OpenAI-compatible chat completions endpoint.
 *
 * Every portable chat provider in this repository speaks this protocol or a
 * compatible dialect, so one request path covers them.
 */
export async function requestChatCompletion(request: ChatRequest): Promise<string> {
  const url = `${request.baseUrl.replace(/\/+$/, '')}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
    }),
    signal: request.signal,
  })

  const payload = await response.json() as CompletionResponse

  if (!response.ok) {
    const message = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
    throw new Error(message)
  }

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
 * Streams a chat completion and reports each text delta.
 *
 * Servers split SSE events across chunk boundaries, so the buffer keeps the
 * trailing partial event until the next chunk arrives.
 */
export async function streamChatCompletion(
  request: ChatRequest,
  onDelta: (text: string) => void,
): Promise<string> {
  const url = `${request.baseUrl.replace(/\/+$/, '')}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
    }),
    signal: request.signal,
  })

  if (!response.ok) {
    const payload = await response.json() as CompletionResponse
    const message = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
    throw new Error(message)
  }

  if (!response.body)
    return requestChatCompletion(request)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const event of events) {
      for (const data of readSseData(event)) {
        if (data === '[DONE]')
          continue

        const parsed = JSON.parse(data) as CompletionResponse
        if (typeof parsed.error?.message === 'string')
          throw new Error(parsed.error.message)

        const delta = parsed.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          onDelta(delta)
        }
      }
    }
  }

  return full
}
