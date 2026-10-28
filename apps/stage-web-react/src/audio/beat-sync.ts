import { errorMessageFrom } from '@moeru/std'

/** Beat detection settings, shared with the settings page. */
export interface BeatSyncParameters {
  minBeatInterval: number
  sensitivity: number
  lowpassFilterFrequency: number
  highpassFilterFrequency: number
  envelopeFilterFrequency: number
  warmup: boolean
  bufferDuration: number
  adaptiveThreshold: boolean
  spectralFlux: boolean
}

export type BeatSyncSpectrumScale = 'logarithm' | 'linear'

export interface BeatSyncInfo {
  /** Beats heard since the runner started. */
  index: number
  /** Estimated tempo from recent beat gaps, or 0 before two beats. */
  bpm: number
  at: number
}

export interface BeatSyncCallbacks {
  onBeat: (info: BeatSyncInfo) => void
  onError?: (message: string) => void
}

export interface BeatSyncSource {
  kind: 'microphone' | 'file'
  file?: File
}

export const beatSyncParametersKey = 'settings/beat-sync/parameters'
export const beatSyncSpectrumScaleKey = 'settings/beat-sync/spectrum-scale'

export const defaultBeatSyncParameters: BeatSyncParameters = {
  minBeatInterval: 0.2,
  sensitivity: 0.7,
  lowpassFilterFrequency: 200,
  highpassFilterFrequency: 30,
  envelopeFilterFrequency: 12,
  warmup: false,
  bufferDuration: 4,
  adaptiveThreshold: false,
  spectralFlux: false,
}

/** Frames per second the detector assumes for its history buffer. */
const framesPerSecond = 60

function mean(values: number[]): number {
  if (!values.length)
    return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function deviation(values: number[], center: number): number {
  if (!values.length)
    return 0
  const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Runs beat detection on a microphone or a local audio file.
 *
 * The signal passes a highpass and a lowpass filter before the analyser, so the
 * detector follows the low band that carries the beat. Each frame compares the
 * band energy with the recent average and reports a beat when the energy jumps.
 */
export class BeatSyncRunner {
  private readonly context: AudioContext
  private readonly analyser: AnalyserNode
  private readonly nodes: AudioNode[]
  private readonly stream: MediaStream | null
  private readonly audio: HTMLAudioElement | null
  private readonly objectUrl: string | null
  private readonly parameters: BeatSyncParameters
  private readonly spectrumScale: BeatSyncSpectrumScale
  private readonly callbacks: BeatSyncCallbacks

  private readonly energyHistory: number[] = []
  private readonly fluxHistory: number[] = []
  private readonly timeData: Float32Array<ArrayBuffer>
  private readonly frequencyData: Uint8Array<ArrayBuffer>
  private previousSpectrum: Float32Array | null = null
  private previousSignal = 0
  private envelope = 0
  private beatTimes: number[] = []
  private beatCount = 0
  private lastBeatAt = 0
  private frameHandle = 0
  private stopped = false

  private constructor(
    context: AudioContext,
    analyser: AnalyserNode,
    nodes: AudioNode[],
    stream: MediaStream | null,
    audio: HTMLAudioElement | null,
    objectUrl: string | null,
    parameters: BeatSyncParameters,
    spectrumScale: BeatSyncSpectrumScale,
    callbacks: BeatSyncCallbacks,
  ) {
    this.context = context
    this.analyser = analyser
    this.nodes = nodes
    this.stream = stream
    this.audio = audio
    this.objectUrl = objectUrl
    this.parameters = parameters
    this.spectrumScale = spectrumScale
    this.callbacks = callbacks
    this.timeData = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT))
    this.frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  }

  static async start(
    source: BeatSyncSource,
    parameters: BeatSyncParameters,
    spectrumScale: BeatSyncSpectrumScale,
    callbacks: BeatSyncCallbacks,
  ): Promise<BeatSyncRunner> {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.5

    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = parameters.highpassFilterFrequency

    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = parameters.lowpassFilterFrequency

    highpass.connect(lowpass)
    lowpass.connect(analyser)

    let stream: MediaStream | null = null
    let audio: HTMLAudioElement | null = null
    let objectUrl: string | null = null
    let input: AudioNode

    if (source.kind === 'file') {
      if (!source.file) {
        await context.close()
        throw new Error('Pick an audio file before you start beat sync')
      }

      objectUrl = URL.createObjectURL(source.file)
      audio = new Audio(objectUrl)
      audio.loop = true
      input = context.createMediaElementSource(audio)
      // The file plays through the speakers, so the pulse matches what you hear.
      analyser.connect(context.destination)
    }
    else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      input = context.createMediaStreamSource(stream)
    }

    input.connect(highpass)

    const runner = new BeatSyncRunner(
      context,
      analyser,
      [highpass, lowpass],
      stream,
      audio,
      objectUrl,
      parameters,
      spectrumScale,
      callbacks,
    )

    await context.resume()
    if (audio)
      await audio.play()

    runner.loop()
    return runner
  }

  private spectrumWeight(index: number, bins: number): number {
    if (this.spectrumScale === 'linear')
      return 1
    return 1 + Math.log2(1 + index) / Math.log2(1 + bins)
  }

  private frameSignal(): number {
    this.analyser.getFloatTimeDomainData(this.timeData)
    let sum = 0
    for (const sample of this.timeData)
      sum += sample * sample
    const rms = Math.sqrt(sum / this.timeData.length)

    const alpha = Math.min(0.9, Math.max(0.01, this.parameters.envelopeFilterFrequency / 60))
    this.envelope += (rms - this.envelope) * alpha

    if (!this.parameters.spectralFlux)
      return this.envelope

    this.analyser.getByteFrequencyData(this.frequencyData)
    const spectrum = new Float32Array(this.frequencyData.length)
    let flux = 0
    for (let index = 0; index < this.frequencyData.length; index += 1) {
      const value = (this.frequencyData[index] ?? 0) / 255
      spectrum[index] = value
      const previous = this.previousSpectrum?.[index] ?? 0
      flux += Math.max(0, value - previous) * this.spectrumWeight(index, this.frequencyData.length)
    }
    this.previousSpectrum = spectrum
    return flux / this.frequencyData.length
  }

  private threshold(history: number[]): number {
    const average = mean(history)
    if (this.parameters.adaptiveThreshold) {
      const spread = deviation(history, average)
      return average + spread * Math.max(0.1, 1.25 - this.parameters.sensitivity) * 2
    }
    return average * (1 + (1 - this.parameters.sensitivity) * 0.8)
  }

  private loop = () => {
    if (this.stopped)
      return

    this.frameHandle = requestAnimationFrame(this.loop)

    const signal = this.frameSignal()
    const history = this.parameters.spectralFlux ? this.fluxHistory : this.energyHistory
    const bufferLength = Math.max(8, Math.round(this.parameters.bufferDuration * framesPerSecond))

    const now = performance.now()
    const cooldownMs = this.parameters.minBeatInterval * 1000
    const warmedUp = !this.parameters.warmup || history.length >= bufferLength / 2
    const rising = signal > this.previousSignal * 1.05
    const above = history.length >= 8 && signal > this.threshold(history)

    if (warmedUp && above && rising && now - this.lastBeatAt >= cooldownMs) {
      this.lastBeatAt = now
      this.beatCount += 1
      this.beatTimes.push(now)
      if (this.beatTimes.length > 8)
        this.beatTimes.shift()

      const gaps: number[] = []
      for (let index = 1; index < this.beatTimes.length; index += 1)
        gaps.push(this.beatTimes[index] - this.beatTimes[index - 1])
      const bpm = gaps.length ? Math.round(60_000 / mean(gaps)) : 0
      this.callbacks.onBeat({ index: this.beatCount, bpm, at: now })
    }

    this.previousSignal = signal
    history.push(signal)
    while (history.length > bufferLength)
      history.shift()
  }

  stop() {
    if (this.stopped)
      return

    this.stopped = true
    if (this.frameHandle)
      cancelAnimationFrame(this.frameHandle)

    for (const node of this.nodes)
      node.disconnect()
    this.analyser.disconnect()

    for (const track of this.stream?.getTracks() ?? [])
      track.stop()

    if (this.audio) {
      this.audio.pause()
      this.audio.src = ''
    }
    if (this.objectUrl)
      URL.revokeObjectURL(this.objectUrl)

    void this.context.close().catch((cause: unknown) => {
      this.callbacks.onError?.(errorMessageFrom(cause) ?? 'Cannot close the audio context')
    })
  }

  /** The beat count the runner reached. */
  get beats(): number {
    return this.beatCount
  }
}
