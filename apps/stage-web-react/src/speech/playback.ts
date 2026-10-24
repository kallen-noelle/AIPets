import { useSyncExternalStore } from 'react'

let speaking = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners)
    listener()
}

function setSpeaking(next: boolean) {
  if (speaking === next)
    return
  speaking = next
  emit()
}

export function getSpeaking(): boolean {
  return speaking
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Cross-route flag that drives the `speaking` animation chain. */
export function useSpeaking(): boolean {
  return useSyncExternalStore(subscribe, getSpeaking, getSpeaking)
}

let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null

function releaseAudio() {
  audio?.pause()
  audio = null
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl)
    audioUrl = null
  }
}

export function stopSpeaking() {
  releaseAudio()
  setSpeaking(false)
}

export interface SpeechOptions {
  baseUrl: string
  apiKey: string
  model: string
  voice: string
}

/**
 * Plays text through an OpenAI-compatible speech endpoint.
 *
 * The `speaking` flag turns on before playback and off on end or error, so the
 * stage can switch between the idle and talk chains.
 */
function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)

  return new Blob([bytes], { type })
}

/**
 * DashScope does not expose `/audio/speech`. Its omni models stream base64
 * audio inside chat completion deltas instead.
 */
async function synthesizeWithOmni(text: string, options: SpeechOptions): Promise<Blob> {
  const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'qwen3-omni-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a text-to-speech engine. Read the user text verbatim and add no extra words.',
        },
        { role: 'user', content: text },
      ],
      modalities: ['text', 'audio'],
      audio: { voice: options.voice || 'Cherry', format: 'mp3' },
      stream: true,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Speech request failed with HTTP ${response.status}`)
  }

  const body = await response.text()
  const parts: string[] = []

  for (const line of body.split('\n')) {
    if (!line.startsWith('data:'))
      continue

    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]')
      continue

    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { audio?: { data?: unknown } } }>
    }
    const data = parsed.choices?.[0]?.delta?.audio?.data
    if (typeof data === 'string')
      parts.push(data)
  }

  if (!parts.length)
    throw new Error('The omni model returned no audio')

  return base64ToBlob(parts.join(''), 'audio/mp3')
}

async function synthesizeWithOpenAI(text: string, options: SpeechOptions): Promise<Blob> {
  const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      input: text,
      voice: options.voice,
      response_format: 'mp3',
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Speech request failed with HTTP ${response.status}`)
  }

  return response.blob()
}

export async function synthesizeSpeech(text: string, options: SpeechOptions): Promise<Blob> {
  if (options.baseUrl.includes('dashscope.aliyuncs.com'))
    return synthesizeWithOmni(text, options)

  return synthesizeWithOpenAI(text, options)
}

export async function speak(text: string, options: SpeechOptions): Promise<void> {
  stopSpeaking()

  audioUrl = URL.createObjectURL(await synthesizeSpeech(text, options))
  audio = new Audio(audioUrl)

  const finish = () => {
    releaseAudio()
    setSpeaking(false)
  }

  audio.addEventListener('ended', finish)
  audio.addEventListener('error', finish)

  setSpeaking(true)
  await audio.play()
}
