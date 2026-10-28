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
  stopLocalSpeech()
  setSpeaking(false)
}

let localUtterance: SpeechSynthesisUtterance | null = null

function stopLocalSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    return

  window.speechSynthesis.cancel()
  localUtterance = null
}

/** True when the browser can read text with its own speech engine. */
export function isLocalSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export interface LocalSpeechOptions {
  lang: string
  voiceURI: string
  rate: number
  pitch: number
}

/**
 * Reads text with the browser speech engine.
 *
 * This path needs no provider, API key, or network request, so the chat page
 * can speak out of the box on a fresh profile.
 */
export function speakLocally(text: string, options: LocalSpeechOptions): Promise<void> {
  stopSpeaking()

  if (!isLocalSpeechAvailable())
    return Promise.reject(new Error('This browser has no speech synthesis support'))

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = options.lang || 'zh-CN'
  utterance.rate = options.rate || 1
  utterance.pitch = options.pitch || 1

  const voice = window.speechSynthesis.getVoices().find(item => item.voiceURI === options.voiceURI)
  if (voice)
    utterance.voice = voice

  localUtterance = utterance

  return new Promise<void>((resolve, reject) => {
    utterance.onend = () => {
      if (localUtterance === utterance) {
        localUtterance = null
        setSpeaking(false)
      }
      resolve()
    }

    utterance.onerror = (event) => {
      if (localUtterance === utterance) {
        localUtterance = null
        setSpeaking(false)
      }

      if (event.error === 'interrupted' || event.error === 'canceled') {
        resolve()
        return
      }

      reject(new Error(`Browser speech synthesis failed: ${event.error}`))
    }

    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  })
}

export interface SpeechOptions {
  baseUrl: string
  apiKey: string
  model: string
  voice: string
}

/**
 * DashScope does not expose `/audio/speech`. Its speech models answer on the
 * speech synthesizer endpoint and return a short-lived audio URL.
 *
 * The omni chat models of this account accept text and audio input, but they
 * refuse the audio output modality. Sambert models serve WebSocket streams only.
 * The non-realtime synthesizer serves `qwen-audio-3.1-tts-flash` and
 * `cosyvoice-v3-flash` over HTTP, so this path uses it.
 */
async function synthesizeWithDashScope(text: string, options: SpeechOptions): Promise<Blob> {
  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'qwen-audio-3.1-tts-flash',
      input: {
        text,
        voice: options.voice || 'longanhuan_v3.1',
        format: 'mp3',
        sample_rate: 24000,
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Speech request failed with HTTP ${response.status}`)
  }

  const payload = await response.json() as {
    output?: { audio?: { url?: unknown } }
    message?: string
  }
  const url = payload.output?.audio?.url
  if (typeof url !== 'string' || !url)
    throw new Error(payload.message ?? 'The speech model returned no audio')

  const audio = await fetch(url)
  if (!audio.ok)
    throw new Error(`Cannot download the speech audio (HTTP ${audio.status})`)

  return audio.blob()
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
    return synthesizeWithDashScope(text, options)

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
