export interface Recording {
  /** Base64 audio without a data URL prefix. */
  data: string
  format: 'wav'
}

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const samples = buffer.getChannelData(0)
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true)
    offset += 2
  }

  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))

  return btoa(binary)
}

export interface Recorder {
  stop: () => Promise<Recording>
}

/**
 * Records the microphone and returns 16-bit mono WAV.
 *
 * DashScope accepts WAV for `input_audio`. Browsers record WebM or MP4, so the
 * clip is decoded and re-encoded before sending.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0)
      chunks.push(event.data)
  })

  recorder.start()

  return {
    stop: () => new Promise<Recording>((resolve, reject) => {
      recorder.addEventListener('stop', () => {
        for (const track of stream.getTracks())
          track.stop()

        void (async () => {
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType })
            const context = new AudioContext()
            const decoded = await context.decodeAudioData(await blob.arrayBuffer())
            await context.close()

            resolve({
              data: bytesToBase64(encodeWav(decoded)),
              format: 'wav',
            })
          }
          catch (cause) {
            reject(cause)
          }
        })()
      }, { once: true })

      recorder.stop()
    }),
  }
}
