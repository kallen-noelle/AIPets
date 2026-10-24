export interface TranscriptionOptions {
  baseUrl: string
  apiKey: string
  model: string
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)

  return new Blob([bytes], { type: mimeType })
}

/**
 * Transcribes a recorded clip through the OpenAI-compatible
 * `/audio/transcriptions` endpoint.
 *
 * DashScope's compatible mode does not expose this path, and its omni chat
 * models answer audio instead of transcribing it, so a provider with a real
 * transcription endpoint is required.
 */
export async function transcribeAudio(
  data: string,
  options: TranscriptionOptions,
  format: 'wav' | 'mp3' = 'wav',
): Promise<string> {
  const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg'
  const body = new FormData()
  body.append('file', base64ToBlob(data, mimeType), `clip.${format}`)
  body.append('model', options.model || 'whisper-1')

  const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}` },
    body,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Transcription failed with HTTP ${response.status}`)
  }

  const payload = await response.json() as { text?: unknown }
  if (typeof payload.text !== 'string')
    throw new Error('The transcription provider returned no text')

  return payload.text.trim()
}
