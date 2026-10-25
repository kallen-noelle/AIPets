import type { AnimationCommand, AnimationEvent, CharacterCatalog, LoadedPack } from '@proj-airi/character-animation'
import type { MouseEvent } from 'react'

import type { VideoSlot } from '../animation/video-player'
import type { LoadedZipPack } from '../animation/zip-pack'
import type { CharacterAppearance } from '../character/characters'

import { errorMessageFrom } from '@moeru/std'
import { AnimationController } from '@proj-airi/character-animation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useDragPhysics } from '../animation/drag-physics'
import { loadAnimationPackFromUrl } from '../animation/pack'
import { CrossfadeVideoPlayer } from '../animation/video-player'
import { defaultCharacterAppearance } from '../character/characters'

export interface StageSnapshot {
  base: string
  clipId: string | null
}

export interface CharacterStageProps {
  manifestUrl?: string
  /** Already extracted pack whose clips live behind object URLs. */
  pack?: LoadedZipPack
  /** Per-character presentation from the generated registry. */
  appearance?: CharacterAppearance
  onReady?: (pack: LoadedPack, catalog?: CharacterCatalog) => void
  onSnapshot?: (snapshot: StageSnapshot) => void
  onClipEnded?: (clipId: string) => void
  onError?: (message: string) => void
  onController?: (dispatch: (event: AnimationEvent) => void) => void
}

/**
 * Renders a transparent video character and drives it through the shared
 * animation controller.
 *
 * The React layer only owns DOM playback and input. Clip choice, chain
 * weights, and one-shot recovery stay inside `@proj-airi/character-animation`.
 */
export function CharacterStage({ manifestUrl, pack, appearance, onReady, onSnapshot, onClipEnded, onError, onController }: CharacterStageProps) {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<AnimationController | null>(null)
  const playerRef = useRef<CrossfadeVideoPlayer | null>(null)
  const resolveRef = useRef<(src: string) => string>(src => src)
  const onClipEndedRef = useRef(onClipEnded)
  const drag = useDragPhysics(stageRef)
  const view = appearance ?? defaultCharacterAppearance

  const [slot, setSlot] = useState<VideoSlot>('a')
  const [fadeMs, setFadeMs] = useState(view.fadeMs)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [canvas, setCanvas] = useState({ width: 720, height: 1280 })

  const applyCommands = useCallback((commands: AnimationCommand[]) => {
    const player = playerRef.current
    const controller = controllerRef.current
    if (!player)
      return

    for (const command of commands) {
      if (command.type === 'play') {
        void player.play(command.clip, command.fadeMs)
        onSnapshot?.({ base: controller?.snapshot.base ?? 'idle', clipId: command.clip.id })
        continue
      }

      if (command.type === 'pause')
        player.pause()
      else
        player.resume()
    }
  }, [onSnapshot])

  const applyCommandsRef = useRef(applyCommands)

  useEffect(() => {
    applyCommandsRef.current = applyCommands
  }, [applyCommands])

  useEffect(() => {
    onClipEndedRef.current = onClipEnded
  }, [onClipEnded])

  useEffect(() => {
    const videos = [videoARef.current, videoBRef.current]

    const handleEnded = (event: Event) => {
      const target = event.currentTarget
      if (!(target instanceof HTMLVideoElement))
        return

      const clipId = target.dataset.clipId
      const controller = controllerRef.current
      if (!clipId || !controller)
        return

      applyCommandsRef.current(controller.clipEnded(clipId))
      onClipEndedRef.current?.(clipId)
    }

    for (const video of videos)
      video?.addEventListener('ended', handleEnded)

    return () => {
      for (const video of videos)
        video?.removeEventListener('ended', handleEnded)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setMessage(null)

    const player = new CrossfadeVideoPlayer({
      videos: () => ({ a: videoARef.current, b: videoBRef.current }),
      resolve: src => resolveRef.current(src),
      onSlotChange: (next, nextFadeMs) => {
        setSlot(next)
        setFadeMs(nextFadeMs)
      },
    })
    playerRef.current = player

    const start = (loadedPack: LoadedPack, resolve: (src: string) => string, loadedCatalog?: CharacterCatalog) => {
      resolveRef.current = resolve
      const controller = new AnimationController(loadedPack)
      controllerRef.current = controller

      setCanvas(loadedPack.manifest.canvas)
      setStatus('ready')
      onReady?.(loadedPack, loadedCatalog)
      applyCommandsRef.current(controller.dispatch({ type: 'idle' }))
    }

    if (pack) {
      start(pack.pack, src => pack.sources[src] ?? src, pack.catalog)
    }
    else if (manifestUrl) {
      void loadAnimationPackFromUrl(manifestUrl)
        .then((loaded) => {
          if (cancelled)
            return

          start(loaded.pack, loaded.resolve, loaded.catalog)
        })
        .catch((error: unknown) => {
          if (cancelled)
            return

          const text = errorMessageFrom(error) ?? 'Unknown error'
          setStatus('error')
          setMessage(text)
          onError?.(text)
        })
    }

    return () => {
      cancelled = true
      player.dispose()
      playerRef.current = null
      controllerRef.current = null
    }
  }, [manifestUrl, pack, onReady, onError])

  useEffect(() => {
    if (!onController)
      return

    onController((event: AnimationEvent) => {
      const controller = controllerRef.current
      if (!controller)
        return

      applyCommandsRef.current(controller.dispatch(event))
    })
  }, [onController])

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!view.clickEnabled || drag.didDrag())
      return

    const controller = controllerRef.current
    if (!controller)
      return

    const rect = event.currentTarget.getBoundingClientRect()
    const area = event.clientY - rect.top < rect.height * 0.35 ? 'head' : 'body'
    applyCommandsRef.current(controller.dispatch({ type: 'click', area }))
  }

  return (
    <div
      ref={stageRef}
      className="relative touch-none select-none overflow-hidden rounded-3xl bg-slate-950/60 shadow-2xl ring-1 ring-white/10"
      style={{
        aspectRatio: `${canvas.width} / ${canvas.height}`,
        width: 'min(360px, 82vw)',
        transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0) scale(${drag.dragging ? 0.97 : 1})`,
        cursor: drag.dragging ? 'grabbing' : 'grab',
      }}
      onClick={handleClick}
      {...drag.handlers}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          transform: `translate(${view.offsetX}%, ${view.offsetY}%) scale(${view.scale})${view.mirror ? ' scaleX(-1)' : ''}`,
        }}
      >
        <video
          ref={videoARef}
          className="absolute inset-0 h-full w-full object-contain transition-opacity ease-out"
          style={{ opacity: slot === 'a' ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
          muted
          playsInline
          preload="auto"
        />
        <video
          ref={videoBRef}
          className="absolute inset-0 h-full w-full object-contain transition-opacity ease-out"
          style={{ opacity: slot === 'b' ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
          muted
          playsInline
          preload="auto"
        />
      </div>

      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 px-6 text-center text-sm text-slate-200">
          {status === 'loading' ? 'Loading animation pack...' : message}
        </div>
      )}
    </div>
  )
}
