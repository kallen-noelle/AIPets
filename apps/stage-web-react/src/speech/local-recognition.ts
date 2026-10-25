/**
 * Browser-native speech recognition.
 *
 * Chrome, Edge, and Safari expose SpeechRecognition. This path needs no
 * provider, API key, or `/audio/transcriptions` endpoint, so dictation works
 * on a fresh profile.
 */

interface RecognitionAlternative {
  transcript: string
}

interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
}

interface RecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: RecognitionResult
  }
}

interface RecognitionErrorEvent {
  error?: string
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type RecognitionConstructor = new () => RecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
}

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined')
    return null

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

/** True when the browser can transcribe the microphone by itself. */
export function isLocalRecognitionAvailable(): boolean {
  return getRecognitionConstructor() !== null
}

export interface LocalRecognitionOptions {
  lang: string
}

export interface LocalRecognitionHandle {
  /** Stops the microphone and resolves with the final transcript. */
  stop: () => Promise<string>
  /** Stops the microphone and drops the transcript. */
  cancel: () => void
}

export function startLocalRecognition(options: LocalRecognitionOptions): LocalRecognitionHandle {
  const Constructor = getRecognitionConstructor()
  if (!Constructor)
    throw new Error('This browser has no speech recognition support')

  const recognition = new Constructor()
  recognition.lang = options.lang || 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true

  let transcript = ''
  let failure: Error | null = null
  let stopped = false
  let settled = false
  let finish: (() => void) | null = null

  const settle = () => {
    if (settled)
      return
    settled = true
    finish?.()
  }

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]
      if (result.isFinal)
        transcript += result[0].transcript
    }
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted')
      return

    failure = new Error(`Browser speech recognition failed: ${event.error ?? 'unknown'}`)
  }

  recognition.onend = settle

  recognition.start()

  return {
    stop: () => new Promise<string>((resolve, reject) => {
      if (stopped) {
        if (failure)
          reject(failure)
        else
          resolve(transcript.trim())
        return
      }

      stopped = true
      finish = () => {
        if (failure)
          reject(failure)
        else
          resolve(transcript.trim())
      }

      recognition.stop()

      // A browser can drop `onend` when the microphone closes first.
      window.setTimeout(settle, 1500)
    }),
    cancel: () => {
      stopped = true
      settled = true
      recognition.abort()
    },
  }
}
