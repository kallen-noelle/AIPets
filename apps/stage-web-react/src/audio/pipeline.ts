/**
 * The microphone side of the audio pipeline.
 *
 * One place opens the microphone with the shared constraints, so the recorder,
 * the settings monitor, and the chat panel all use the same device and the same
 * noise handling. The voice activity detector reads the same stream and tells
 * the UI when speech starts and stops.
 */

/** Constraints that every microphone open shares. */
export const microphoneDefaults = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

/** Storage keys of the noise handling switches, shared by settings and recorder. */
export const audioToggleKeys = {
  echoCancellation: 'airi:react:audio/echo-cancellation',
  noiseSuppression: 'airi:react:audio/noise-suppression',
  autoGainControl: 'airi:react:audio/auto-gain-control',
}

export interface MicrophoneOptions {
  deviceId?: string
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

/** Opens the microphone. A silent permission prompt fails after 30 seconds. */
export async function openMicrophone(options: MicrophoneOptions = {}): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    throw new Error('This environment has no microphone API.')

  const audio: MediaTrackConstraints = {
    echoCancellation: options.echoCancellation ?? microphoneDefaults.echoCancellation,
    noiseSuppression: options.noiseSuppression ?? microphoneDefaults.noiseSuppression,
    autoGainControl: options.autoGainControl ?? microphoneDefaults.autoGainControl,
  }

  if (options.deviceId)
    audio.deviceId = { exact: options.deviceId }

  const access = navigator.mediaDevices.getUserMedia({ audio })

  return await new Promise<MediaStream>((resolve, reject) => {
    // A browser can keep the request pending while the user ignores the
    // permission prompt. The timeout turns that silence into an error.
    const timer = setTimeout(() => reject(new Error('The microphone did not respond in 30 seconds')), 30_000)
    access.then((stream) => {
      clearTimeout(timer)
      resolve(stream)
    }, (error: unknown) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

export interface VoiceActivityState {
  /** RMS level of the current frame, from 0 to 1. */
  level: number
  speaking: boolean
}

export interface VoiceActivityDetector {
  start: () => void
  stop: () => void
  subscribe: (listener: (state: VoiceActivityState) => void) => () => void
}

export interface VoiceActivityOptions {
  /** RMS level that counts as speech. */
  threshold?: number
  /** How long speech stays on after the level drops. */
  silenceMs?: number
  /** How often the detector samples, in milliseconds. */
  intervalMs?: number
}

/**
 * Reads a microphone stream and reports speech. It does not open or close the
 * stream, because the owner of the stream decides its lifetime.
 */
export function createVoiceActivityDetector(
  stream: MediaStream,
  options: VoiceActivityOptions = {},
): VoiceActivityDetector {
  const threshold = options.threshold ?? 0.02
  const silenceMs = options.silenceMs ?? 700
  const intervalMs = options.intervalMs ?? 100

  const listeners = new Set<(state: VoiceActivityState) => void>()
  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let lastLoudAt = 0
  let state: VoiceActivityState = { level: 0, speaking: false }

  const emit = (next: VoiceActivityState) => {
    state = next
    for (const listener of listeners)
      listener(next)
  }

  const sample = () => {
    if (!analyser)
      return

    const frame = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(frame)

    let sum = 0
    for (const value of frame) {
      const centered = (value - 128) / 128
      sum += centered * centered
    }

    const level = Math.sqrt(sum / frame.length)
    const now = Date.now()
    if (level >= threshold)
      lastLoudAt = now

    const speaking = level >= threshold || now - lastLoudAt < silenceMs
    emit({ level, speaking })
  }

  return {
    start() {
      if (timer)
        return

      context = new AudioContext()
      analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(stream).connect(analyser)
      void context.resume()

      timer = setInterval(sample, intervalMs)
      sample()
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }

      analyser = null
      void context?.close()
      context = null
      lastLoudAt = 0
      emit({ level: 0, speaking: false })
    },
    subscribe(listener) {
      listeners.add(listener)
      if (state.level !== 0 || state.speaking)
        listener(state)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}
