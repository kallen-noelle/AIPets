import type { NormalizedClip } from '@proj-airi/character-animation'

export type VideoSlot = 'a' | 'b'

export interface CrossfadeVideoPlayerOptions {
  videos: () => { a: HTMLVideoElement | null, b: HTMLVideoElement | null }
  resolve: (src: string) => string
  onSlotChange: (slot: VideoSlot, fadeMs: number) => void
}

/**
 * Plays clips on two stacked video elements and crossfades between them.
 *
 * One element always holds the current clip. The other one loads the next
 * clip, fades in, and then pauses the old element. This avoids the black
 * frame that appears when a single element swaps its source.
 */
export class CrossfadeVideoPlayer {
  private slot: VideoSlot = 'a'
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly options: CrossfadeVideoPlayerOptions) {}

  async play(clip: NormalizedClip, fadeMs: number): Promise<void> {
    const { a, b } = this.options.videos()
    if (!a || !b)
      return

    const next: VideoSlot = this.slot === 'a' ? 'b' : 'a'
    const target = next === 'a' ? a : b
    const previous = next === 'a' ? b : a

    if (target.dataset.clipId !== clip.id) {
      target.src = this.options.resolve(clip.src)
      target.dataset.clipId = clip.id
    }

    target.loop = clip.loop
    try {
      target.currentTime = 0
    }
    catch {
      // Metadata is not ready yet. Playback starts at the beginning anyway.
    }

    this.slot = next
    this.options.onSlotChange(next, fadeMs)

    try {
      await target.play()
    }
    catch {
      // Autoplay can be rejected before the first user gesture.
    }

    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      previous?.pause()
    }, fadeMs + 50)
  }

  pause(): void {
    for (const video of Object.values(this.options.videos()))
      video?.pause()
  }

  resume(): void {
    const video = this.options.videos()[this.slot]
    void video?.play().catch(() => {})
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.pause()
  }
}
