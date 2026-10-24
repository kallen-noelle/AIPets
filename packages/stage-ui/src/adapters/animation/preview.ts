import { loadAnimationPack } from './zip-loader'

const maxPreviewDimension = 512
const frameReadyTimeoutMs = 5_000

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function toDataUrl(source: CanvasImageSource, width: number, height: number): string | undefined {
  const scale = Math.min(1, maxPreviewDimension / Math.max(width, height))
  const canvas = createCanvas(width * scale, height * scale)
  const context = canvas.getContext('2d')
  if (!context)
    return undefined

  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

async function readImagePreview(url: string): Promise<string | undefined> {
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  }
  catch {
    return undefined
  }

  return toDataUrl(image, image.naturalWidth, image.naturalHeight)
}

async function readFirstFramePreview(url: string): Promise<string | undefined> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for the first animation frame'))
    }, frameReadyTimeoutMs)

    function cleanup() {
      clearTimeout(timer)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('error', onError)
    }

    function onLoaded() {
      cleanup()
      resolve()
    }

    function onError() {
      cleanup()
      reject(new Error('Failed to decode the animation clip'))
    }

    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
  })

  try {
    await ready
    return toDataUrl(video, video.videoWidth, video.videoHeight)
  }
  catch {
    return undefined
  }
  finally {
    video.removeAttribute('src')
    video.load()
  }
}

/**
 * Builds a preview image for an animation pack. It uses `preview.png` when the
 * pack ships one, and otherwise captures the first frame of the idle chain.
 */
export async function loadAnimationPackPreview(file: File): Promise<string | undefined> {
  const loaded = await loadAnimationPack(file)

  try {
    if (loaded.previewUrl) {
      const preview = await readImagePreview(loaded.previewUrl)
      if (preview)
        return preview
    }

    const idleClip = loaded.pack.chains.idle[0]
    const idleUrl = idleClip ? loaded.sources[idleClip.src] : undefined
    if (!idleUrl)
      return undefined

    return await readFirstFramePreview(idleUrl)
  }
  finally {
    loaded.dispose()
  }
}
