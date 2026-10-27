import type { AnimationCommand, AnimationEvent, CharacterCatalog, ClickArea, LoadedPack } from '@proj-airi/character-animation'
import type { MouseEvent } from 'react'

import type { VideoSlot } from '../animation/video-player'
import type { LoadedZipPack } from '../animation/zip-pack'
import type { CharacterAppearance } from '../character/characters'

import { errorMessageFrom } from '@moeru/std'
import { AnimationController } from '@proj-airi/character-animation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { animationLog } from '../animation/animation-log'
import { useDragPhysics } from '../animation/drag-physics'
import { loadAnimationPackFromUrl } from '../animation/pack'
import { CrossfadeVideoPlayer } from '../animation/video-player'
import { defaultCharacterAppearance } from '../character/characters'

export interface StageSnapshot {
  base: string
  clipId: string | null
  longActionName: string | null
  longActionPhase: string | null
  waiting: boolean
}

export interface CharacterStageProps {
  manifestUrl?: string
  /** Already extracted pack whose clips live behind object URLs. */
  pack?: LoadedZipPack
  /** Per-character presentation from the generated registry. */
  appearance?: CharacterAppearance
  /** Assistant reply shown in the bubble above the character. `null` hides it. */
  speechText?: string | null
  onReady?: (pack: LoadedPack, catalog?: CharacterCatalog) => void
  onSnapshot?: (snapshot: StageSnapshot) => void
  onClipEnded?: (clipId: string) => void
  onUserClick?: (area: ClickArea) => void
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
export function CharacterStage({ manifestUrl, pack, appearance, speechText, onReady, onSnapshot, onClipEnded, onUserClick, onError, onController }: CharacterStageProps) {
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
  const [naturalSize, setNaturalSize] = useState<{ width: number, height: number } | null>(null)
  const [bubbleText, setBubbleText] = useState<string | null>(speechText ?? null)
  const [bubbleVisible, setBubbleVisible] = useState(Boolean(speechText))

  useEffect(() => {
    if (speechText) {
      setBubbleText(speechText)
      setBubbleVisible(true)
      return
    }

    // Keep the last text mounted while it fades out, then unmount it.
    setBubbleVisible(false)
    const timer = window.setTimeout(setBubbleText, 250, null)
    return () => window.clearTimeout(timer)
  }, [speechText])

  const applyCommands = useCallback((commands: AnimationCommand[]) => {
    const player = playerRef.current
    const controller = controllerRef.current
    if (!player) {
      animationLog.write('stage', 'applyCommands skipped: player not ready')
      return
    }

    if (commands.length === 0)
      animationLog.write('stage', 'controller returned 0 commands')

    for (const command of commands) {
      if (command.type === 'play') {
        animationLog.write('stage', `play clip: ${command.clip.id}`, {
          src: command.clip.src,
          loop: command.clip.loop,
          fadeMs: command.fadeMs,
        })
        void player.play(command.clip, command.fadeMs)
        const snapshot = controller?.snapshot
        onSnapshot?.({
          base: snapshot?.base ?? 'idle',
          clipId: command.clip.id,
          longActionName: snapshot?.longActionName ?? null,
          longActionPhase: snapshot?.longActionPhase ?? null,
          waiting: snapshot?.waiting ?? false,
        })
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

      // A slot that a later clip replaced can still fire `ended` during the fade.
      const activeSlot = playerRef.current?.activeSlot
      if (activeSlot) {
        const activeVideo = activeSlot === 'a' ? videoARef.current : videoBRef.current
        if (target !== activeVideo)
          return
      }

      const clipId = target.dataset.clipId
      const controller = controllerRef.current
      if (!clipId || !controller)
        return

      applyCommandsRef.current(controller.clipEnded(clipId))
      onClipEndedRef.current?.(clipId)
    }

    const handleMetadata = (event: Event) => {
      const target = event.currentTarget
      if (!(target instanceof HTMLVideoElement))
        return

      if (target.videoWidth > 0 && target.videoHeight > 0)
        setNaturalSize({ width: target.videoWidth, height: target.videoHeight })
    }

    for (const video of videos) {
      video?.addEventListener('ended', handleEnded)
      video?.addEventListener('loadedmetadata', handleMetadata)
    }

    return () => {
      for (const video of videos) {
        video?.removeEventListener('ended', handleEnded)
        video?.removeEventListener('loadedmetadata', handleMetadata)
      }
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
      const controller = new AnimationController(loadedPack, {
        onCommands: commands => applyCommandsRef.current(commands),
      })
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
      controllerRef.current?.dispose()
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
    const area: ClickArea = event.clientY - rect.top < rect.height * 0.35 ? 'head' : 'body'

    // A click must leave a long action through its end clip. Dispatching the
    // click clip directly would cut the long action with no exit transition.
    if (controller.snapshot.longActionName)
      applyCommandsRef.current(controller.dispatch({ type: 'longActionStop', mode: 'end' }))
    else
      applyCommandsRef.current(controller.dispatch({ type: 'click', area }))

    onUserClick?.(area)
  }

  const frame = naturalSize ?? canvas

  return (
    <div
      ref={stageRef}
      className="relative touch-none select-none overflow-hidden bg-transparent"
      style={{
        width: `${frame.width}px`,
        maxWidth: '100%',
        aspectRatio: `${frame.width} / ${frame.height}`,
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

      {bubbleText && (
        <div
          aria-live="polite"
          className="airi-stage-bubble"
          data-visible={bubbleVisible}
        >
          {bubbleText}
        </div>
      )}

      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 px-6 text-center text-sm text-slate-200">
          {status === 'loading' ? 'Loading animation pack...' : message}
        </div>
      )}
    </div>
  )
}
