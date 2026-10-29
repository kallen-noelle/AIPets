import type {
  ActionSequence,
  AffectLabel,
  AnimationClockPort,
  AnimationEvent,
  CharacterCatalog,
  LoadedPack,
  PerformanceCue,
  PerformancePlan,
  PlanTimelineMark,
} from '@proj-aipets/character-animation'

import type { DirectorLongAction } from '../animation/director'
import type { LoadedZipPack } from '../animation/zip-pack'
import type { BuiltinCharacter, CharacterAppearance } from '../character/characters'
import type { CharacterInstance } from '../character/instances'
import type { CharacterStageProps, StageSnapshot } from '../components/character-stage'

import { errorMessageFrom } from '@moeru/std'
import { resolvePlanArrival, validatePerformancePlan } from '@proj-aipets/character-animation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { animationLog } from '../animation/animation-log'
import { describeLongActions } from '../animation/director'
import { directorBus } from '../animation/director-bus'
import { recordClipPlayed } from '../animation/playback-history'
import { sessionController, useSessionPhase } from '../animation/session-controller'
import { useAmbient } from '../animation/use-ambient'
import { WaitingSequenceRunner } from '../animation/waiting-sequence'
import { getActivePackId, loadStoredPack } from '../animation/zip-pack'
import {
  beatSyncParametersKey,
  BeatSyncRunner,
  beatSyncSpectrumScaleKey,
  defaultBeatSyncParameters,
} from '../audio/beat-sync'
import { affectStore, useAffect } from '../character/affect-store'
import {
  characterManifestUrl,
  defaultCharacterAppearance,
  getActiveCharacterId,
  loadBuiltinCharacters,
  setActiveCharacterId as persistActiveCharacterId,
  readCharacterSetting,
} from '../character/characters'
import {
  chatInstanceKey,
  resolveChatInstance,
  useCharacterInstances,
} from '../character/instances'
import { CharacterStage } from '../components/character-stage'
import { ChatPanel } from '../components/chat-panel'
import { ConfigurationHint } from '../components/configuration-hint'
import { getDesktopBridge, isDesktop } from '../desktop/bridge'
import { publishDirectorContext } from '../desktop/pet-relay'
import { readStored, useStoredValue } from '../settings/persisted'
import { getSpeaking, useSpeaking } from '../speech/playback'

const demoManifestUrl = './animations/demo/manifest.json'

const buttonClass = [
  'rounded-full px-4 py-2 text-sm font-medium transition',
  'bg-[var(--aipets-card)] text-[var(--aipets-fg)] hover:bg-[var(--aipets-hover)] active:scale-95',
].join(' ')

const ambientTags: Record<AffectLabel, string[]> = {
  excited: ['excited', 'happy', 'play'],
  content: ['happy', 'ambient', 'play'],
  calm: ['ambient', 'look'],
  shy: ['shy'],
  proud: ['proud', 'vanity'],
  sad: ['sad'],
  angry: ['angry'],
  sleepy: ['sleepy'],
}

const ambientIntervals: Record<AffectLabel, number> = {
  excited: 18_000,
  content: 25_000,
  calm: 35_000,
  shy: 30_000,
  proud: 30_000,
  sad: 45_000,
  angry: 40_000,
  sleepy: 60_000,
}

function createBrowserClock(): AnimationClockPort {
  return {
    now: () => performance.now(),
    setTimer: (delayMs, callback) => {
      const id = window.setTimeout(callback, delayMs)
      return () => window.clearTimeout(id)
    },
  }
}

export interface StagePageProps {
  /** `pet` renders the character alone, for the desktop pet window. */
  layout?: 'page' | 'pet'
  /** The pet instance of this window. The page layout has none. */
  instance?: CharacterInstance | null
}

export function StagePage({ layout = 'page', instance = null }: StagePageProps) {
  const { t } = useTranslation()
  const dispatchRef = useRef<((event: AnimationEvent) => void) | null>(null)
  const planTimersRef = useRef<number[]>([])
  const planCooldownUntilRef = useRef(0)
  const snapshotRef = useRef<StageSnapshot>({
    base: 'idle',
    clipId: null,
    longActionName: null,
    longActionPhase: null,
    waiting: false,
  })
  const waitingRunnerRef = useRef<WaitingSequenceRunner | null>(null)
  const waitingSequenceRef = useRef<ActionSequence | null>(null)
  const timelineMarksRef = useRef<PlanTimelineMark[]>([])
  const pendingCuesRef = useRef<PerformanceCue[]>([])

  const sessionPhase = useSessionPhase()
  const [catalog, setCatalog] = useState<CharacterCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [beatRunning, setBeatRunning] = useState(false)
  const [beats, setBeats] = useState(0)
  const [bpm, setBpm] = useState(0)
  const [beatStarting, setBeatStarting] = useState(false)
  const [beatError, setBeatError] = useState<string | null>(null)
  const beatFileRef = useRef<HTMLInputElement>(null)
  const beatRunnerRef = useRef<BeatSyncRunner | null>(null)
  const [activePack, setActivePack] = useState<LoadedZipPack | null>(null)
  const [packLongActions, setPackLongActions] = useState<DirectorLongAction[]>([])
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [speechBubble, setSpeechBubble] = useState<string | null>(null)
  const speechBubbleTimerRef = useRef<number | null>(null)

  const [instances] = useCharacterInstances()
  const [chatInstanceId] = useStoredValue(chatInstanceKey, '')

  // The stage shows every enabled instance at once. The instance the chat
  // talks to is the one that follows the director.
  const enabledInstances = useMemo(
    () => instances.filter(entry => entry.enabled),
    [instances],
  )
  const primaryInstance = instance ?? resolveChatInstance(enabledInstances, chatInstanceId)
  const activeCharacterId = primaryInstance?.characterId ?? null

  const characterId = activeCharacterId ?? activePack?.pack.manifest.id ?? 'demo'
  const affect = useAffect(characterId)

  const showSpeechBubble = useCallback((text: string | null) => {
    setSpeechBubble(text)
    if (speechBubbleTimerRef.current !== null) {
      window.clearTimeout(speechBubbleTimerRef.current)
      speechBubbleTimerRef.current = null
    }
    if (text === null)
      return
    speechBubbleTimerRef.current = window.setTimeout(setSpeechBubble, 5000, null as string | null)
  }, [])
  const affectLabel = affect.state?.label ?? null
  const activeCharacter = characters.find(character => character.id === activeCharacterId) ?? null
  const activeCharacterName = activeCharacterId
    ? readCharacterSetting(activeCharacterId, 'name', activeCharacter?.name ?? activeCharacterId)
    : activePack?.profile.name ?? 'aipetdex'
  const persona = activeCharacterId ? readCharacterSetting(activeCharacterId, 'persona', '') : ''

  useEffect(() => {
    let disposed = false

    void loadBuiltinCharacters()
      .then((next) => {
        if (disposed)
          return

        setCharacters(next)

        const stored = getActiveCharacterId()
        if (stored && !next.some(character => character.id === stored))
          persistActiveCharacterId(null)
      })
      .catch((error: unknown) => {
        if (!disposed)
          setError(errorMessageFrom(error) ?? 'Cannot load characters')
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (getActiveCharacterId())
      return

    const id = getActivePackId()
    if (!id)
      return

    let disposed = false
    let loaded: LoadedZipPack | null = null

    void loadStoredPack(id).then((next) => {
      if (disposed) {
        next?.dispose()
        return
      }

      loaded = next
      setActivePack(next)
    })

    return () => {
      disposed = true
      loaded?.dispose()
    }
  }, [])

  const voiceSpeaking = useSpeaking()

  useEffect(() => {
    dispatchRef.current?.({ type: 'speaking', value: voiceSpeaking })
  }, [voiceSpeaking])

  useEffect(() => {
    directorBus.setContext({ active: true })
    publishDirectorContext()
    const unsubscribe = directorBus.subscribeEvents((event) => {
      dispatchRef.current?.(event)
    })

    return () => {
      unsubscribe()
      directorBus.setContext({ active: false })
      publishDirectorContext()
    }
  }, [])

  useEffect(() => {
    directorBus.setContext({
      catalog,
      characterId,
      characterName: activeCharacterName,
      persona,
      longActions: packLongActions,
    })
    publishDirectorContext()
  }, [catalog, characterId, activeCharacterName, persona, packLongActions])

  const playClip = useCallback((clipId: string) => {
    recordClipPlayed(clipId)
    dispatchRef.current?.({ type: 'playClip', clipId })
  }, [])

  /** Stable controller entry point for modules that outlive a render. */
  const sendEvent = useCallback((event: AnimationEvent) => {
    dispatchRef.current?.(event)
  }, [])

  const clipDurations = useCallback((): Record<string, number> => {
    if (!catalog)
      return {}

    const map: Record<string, number> = {}
    for (const clip of catalog.clips) {
      if (clip.durationMs !== undefined)
        map[clip.id] = clip.durationMs
    }
    return map
  }, [catalog])

  const playWaitingSequence = useCallback(() => {
    const runner = waitingRunnerRef.current
    const sequence = waitingSequenceRef.current
    if (!runner || !sequence)
      return

    waitingSequenceRef.current = null
    const acceptedMs = runner.play(sequence, sessionController.sequenceBudgetMs())
    animationLog.write('session', 'waiting sequence started', {
      steps: sequence.steps.length,
      acceptedMs,
    })
  }, [])

  const flushPendingCues = useCallback(() => {
    if (!pendingCuesRef.current.length)
      return

    const decision = resolvePlanArrival({
      cues: pendingCuesRef.current,
      marks: timelineMarksRef.current,
      now: Date.now(),
      clipDurations: clipDurations(),
    })

    animationLog.write('plan', 'pending cues flushed', {
      playNow: decision.playNow.map(cue => cue.clipId),
      scheduled: decision.scheduled.length,
      dropped: decision.dropped,
    })

    for (const cue of decision.playNow)
      playClip(cue.clipId)
    for (const item of decision.timed) {
      planTimersRef.current.push(window.setTimeout(playClip, item.inMs, item.cue.clipId))
    }
    pendingCuesRef.current = decision.scheduled
  }, [clipDurations, playClip])

  const ambient = useAmbient({
    characterId,
    characterName: activeCharacterName,
    persona,
    catalog,
    longActions: packLongActions,
    dispatch: sendEvent,
  })

  useEffect(() => {
    if (!catalog)
      return

    const runner = new WaitingSequenceRunner({
      dispatch: event => dispatchRef.current?.(event),
      clock: createBrowserClock(),
      clipDurationMs: id => catalog.clips.find(clip => clip.id === id)?.durationMs,
    })
    waitingRunnerRef.current = runner

    return () => {
      runner.interrupt()
      waitingRunnerRef.current = null
    }
  }, [catalog])

  useEffect(() => directorBus.subscribeSequences((sequence) => {
    waitingSequenceRef.current = sequence
    if (sessionController.phase === 'waiting')
      playWaitingSequence()
  }), [playWaitingSequence])

  useEffect(() => directorBus.subscribeTimeline((event) => {
    if (event.type === 'reply-start')
      timelineMarksRef.current = []

    timelineMarksRef.current.push({ type: event.type, index: event.index, at: event.at })
    flushPendingCues()
  }), [flushPendingCues])

  useEffect(() => sessionController.subscribe((transition) => {
    const dispatch = (event: AnimationEvent) => dispatchRef.current?.(event)

    if (transition.effects.includes('stop-long-action') && snapshotRef.current.longActionPhase !== 'end')
      dispatch({ type: 'longActionStop' })

    if (transition.to === 'listening') {
      waitingRunnerRef.current?.interrupt()
      dispatch({ type: 'waiting', value: false })
    }

    if (transition.effects.includes('enter-thinking')) {
      waitingRunnerRef.current?.interrupt()
      dispatch({ type: 'waiting', value: false })
      dispatch({ type: 'thinking', value: true })
    }

    if (transition.effects.includes('enter-talking'))
      dispatch({ type: 'thinking', value: false })

    if (transition.effects.includes('enter-waiting')) {
      dispatch({ type: 'thinking', value: false })
      dispatch({ type: 'waiting', value: true })
      playWaitingSequence()
    }

    if (transition.effects.includes('enter-ambient')) {
      waitingRunnerRef.current?.interrupt()
      waitingSequenceRef.current = null
      pendingCuesRef.current = []
      dispatch({ type: 'waiting', value: false })
      dispatch({ type: 'thinking', value: false })
    }

    if (transition.effects.includes('reorder-plan'))
      ambient.reorder()

    // Entering ends when no long action blocks the waiting chain.
    if (transition.to === 'entering' && !snapshotRef.current.longActionName)
      sessionController.notifyEntered()
  }), [playWaitingSequence, ambient.reorder])

  useEffect(() => {
    // The ambient program owns ambient behavior. The random fallback only runs
    // when no program is available, so it cannot cut a scheduled action.
    if (ambient.program || sessionPhase !== 'ambient' || !catalog || !affectLabel || voiceSpeaking)
      return

    const tags = ambientTags[affectLabel]
    const candidates = catalog.clips.filter(clip =>
      clip.role !== 'loop' && tags.some(tag => clip.tags.includes(tag)),
    )
    if (!candidates.length)
      return

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() < planCooldownUntilRef.current)
        return

      const clip = candidates[Math.floor(Math.random() * candidates.length)]
      if (clip)
        playClip(clip.id)
    }, ambientIntervals[affectLabel])

    return () => window.clearInterval(timer)
  }, [ambient.program, sessionPhase, catalog, affectLabel, voiceSpeaking, playClip])

  const handleController = useCallback((dispatch: (event: AnimationEvent) => void) => {
    dispatchRef.current = dispatch
    dispatch({ type: 'speaking', value: getSpeaking() })
  }, [])

  const handleSnapshot = useCallback((next: StageSnapshot) => {
    snapshotRef.current = next

    // The end clip of a long action delays the waiting chain. Entering is done
    // once no long action is running.
    if (sessionController.phase === 'entering' && !next.longActionName)
      sessionController.notifyEntered()
  }, [])

  const handleUserClick = useCallback(() => {
    affectStore.applyEvent('click')
    sessionController.notifyInteraction('click')
  }, [])

  const handleReady = useCallback((pack: LoadedPack, nextCatalog?: CharacterCatalog) => {
    setCatalog(nextCatalog ?? null)
    // Built-in characters arrive through this callback, not through
    // `activePack`. Reading long actions from the pack keeps the director prompt
    // complete for them too.
    setPackLongActions(describeLongActions(pack.longActions))
  }, [])

  useEffect(() => {
    return () => {
      for (const id of planTimersRef.current)
        window.clearTimeout(id)
      if (speechBubbleTimerRef.current !== null)
        window.clearTimeout(speechBubbleTimerRef.current)
    }
  }, [])

  const handleError = useCallback((nextMessage: string) => {
    setError(nextMessage)
  }, [])

  const stopPlan = useCallback(() => {
    for (const id of planTimersRef.current)
      window.clearTimeout(id)
    planTimersRef.current = []
    pendingCuesRef.current = []
    planCooldownUntilRef.current = 0
  }, [])

  const executePlan = useCallback((plan: PerformancePlan) => {
    if (!catalog) {
      animationLog.write('plan', 'skip: catalog missing')
      return
    }

    stopPlan()
    if (plan.affect)
      affectStore.applyDelta(plan.affect)

    const marks = timelineMarksRef.current
    const decision = marks.length
      ? resolvePlanArrival({
          cues: plan.cues,
          marks,
          now: Date.now(),
          clipDurations: clipDurations(),
        })
      : {
          // A cold start has no reply marks yet. Play in plan order instead of
          // parking every cue as a future anchor.
          playNow: [...plan.cues],
          timed: [],
          scheduled: [],
          dropped: [],
        }

    animationLog.write('plan', 'arrival decision', {
      cues: plan.cues.map(cue => ({ anchor: cue.anchor, clipId: cue.clipId, intensity: cue.intensity })),
      affect: plan.affect,
      playNow: decision.playNow.map(cue => cue.clipId),
      timed: decision.timed.map(item => ({ clipId: item.cue.clipId, inMs: item.inMs })),
      scheduled: decision.scheduled.length,
      dropped: decision.dropped,
    })

    for (const cue of decision.playNow)
      playClip(cue.clipId)
    for (const item of decision.timed) {
      planTimersRef.current.push(window.setTimeout(playClip, item.inMs, item.cue.clipId))
    }
    pendingCuesRef.current = decision.scheduled
    planCooldownUntilRef.current = Date.now() + 6000
  }, [catalog, clipDurations, playClip, stopPlan])

  useEffect(() => {
    if (!catalog)
      return

    animationLog.write('bus', 'stage subscribed to plans')

    return directorBus.subscribePlans((plan) => {
      const validation = validatePerformancePlan(plan, {
        catalog,
        maxCues: Number.POSITIVE_INFINITY,
        longActionIds: Object.keys(activePack?.pack.longActions ?? {}),
      })
      if (validation.ok && validation.plan)
        executePlan(validation.plan)
      else
        animationLog.write('plan', 'stage validation failed', validation.issues)
    })
  }, [catalog, executePlan, activePack])

  // Assistant replies reach the head bubble through their own channel, so the
  // bubble also works when the director is disabled or its model call fails.
  useEffect(() => directorBus.subscribeBubble((text) => {
    const trimmed = text?.trim()
    showSpeechBubble(trimmed || null)
  }), [showSpeechBubble])

  const startBeats = async (kind: 'microphone' | 'file', file?: File) => {
    setBeatError(null)
    setBeatStarting(true)

    try {
      const parameters = readStored(beatSyncParametersKey, defaultBeatSyncParameters)
      const spectrumScale = readStored<'logarithm' | 'linear'>(beatSyncSpectrumScaleKey, 'logarithm')
      const runner = await BeatSyncRunner.start({ kind, file }, parameters, spectrumScale, {
        onBeat: (info) => {
          setBeats(info.index)
          setBpm(info.bpm)
        },
        onError: message => setBeatError(message),
      })

      beatRunnerRef.current?.stop()
      beatRunnerRef.current = runner
      setBeats(0)
      setBpm(0)
      setBeatRunning(true)
    }
    catch (cause) {
      setBeatError(errorMessageFrom(cause) ?? 'Beat sync failed')
    }
    finally {
      setBeatStarting(false)
    }
  }

  const stopBeats = useCallback(() => {
    beatRunnerRef.current?.stop()
    beatRunnerRef.current = null
    setBeatRunning(false)
    setBeats(0)
    setBpm(0)
  }, [])

  // A page change must not leave the microphone or the audio file running.
  useEffect(() => () => {
    beatRunnerRef.current?.stop()
    beatRunnerRef.current = null
  }, [])

  // In the desktop pet window a drag moves the window, so the character stays
  // whole at every screen edge.
  const windowDrag = layout === 'pet' && isDesktop()
  const dragBridge = windowDrag ? getDesktopBridge() : null
  const windowDragProps: Partial<CharacterStageProps> = windowDrag
    ? {
        moveWindowOnDrag: true,
        onWindowDragStart: () => dragBridge?.beginPetDrag(),
        onWindowDragEnd: () => dragBridge?.endPetDrag(),
      }
    : {}

  // A pet window reads the look of its own instance. The page layout reads the
  // look of the instance the chat talks to.
  const activeAppearance: CharacterAppearance = instance?.appearance
    ?? primaryInstance?.appearance
    ?? activeCharacter?.appearance
    ?? activePack?.profile.appearance
    ?? defaultCharacterAppearance

  // The pet window is the character frame, so the scale resizes the window and
  // the whole character stays visible at its largest setting.
  useEffect(() => {
    if (layout !== 'pet')
      return

    getDesktopBridge()?.setPetScale(activeAppearance.scale)
  }, [layout, activeAppearance.scale])

  const characterView = (
    <div className={[
      'relative flex w-full items-center justify-center',
      // The pet window is shorter than some packs, so the stage must shrink to
      // the window height. That needs a definite height on this wrapper.
      layout === 'pet' ? 'h-full items-end' : '',
    ].join(' ')}
    >
      {activeCharacter
        ? (
            <CharacterStage
              {...windowDragProps}
              manifestUrl={characterManifestUrl(activeCharacter)}
              appearance={activeAppearance}
              onController={handleController}
              onSnapshot={handleSnapshot}
              onUserClick={handleUserClick}
              onReady={handleReady}
              onClipEnded={ambient.handleClipEnded}
              onError={handleError}
              speechText={speechBubble}
            />
          )
        : activePack
          ? (
              <CharacterStage
                {...windowDragProps}
                pack={activePack}
                appearance={activeAppearance}
                onController={handleController}
                onSnapshot={handleSnapshot}
                onUserClick={handleUserClick}
                onReady={handleReady}
                onClipEnded={ambient.handleClipEnded}
                onError={handleError}
                speechText={speechBubble}
              />
            )
          : (
              <CharacterStage
                {...windowDragProps}
                manifestUrl={demoManifestUrl}
                appearance={activeAppearance}
                onController={handleController}
                onSnapshot={handleSnapshot}
                onUserClick={handleUserClick}
                onReady={handleReady}
                onClipEnded={ambient.handleClipEnded}
                onError={handleError}
                speechText={speechBubble}
              />
            )}

      {beatRunning && beats > 0 && <div key={beats} className="aipets-beat-ring" />}
    </div>
  )

  // The desktop pet window ignores the pointer outside the character, so the
  // desktop below keeps its clicks. The character box follows the pack and the
  // window size, so report it again on a slow timer.
  useEffect(() => {
    if (layout !== 'pet')
      return

    const bridge = getDesktopBridge()
    if (!bridge)
      return

    const report = () => {
      const stage = document.querySelector('[data-aipets-stage]')
      if (!stage)
        return

      const rect = stage.getBoundingClientRect()
      bridge.reportPetHitbox({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }

    report()
    window.addEventListener('resize', report)
    const timer = setInterval(report, 500)

    return () => {
      window.removeEventListener('resize', report)
      clearInterval(timer)
    }
  }, [layout])

  // The desktop pet window shows the character and nothing else.
  if (layout === 'pet') {
    return (
      <div className={[
        'relative h-screen w-screen select-none overflow-hidden',
        isDesktop() ? 'bg-transparent' : 'bg-[var(--aipets-bg)]',
      ].join(' ')}
      >
        <div className="h-full w-full flex items-end justify-center">
          {characterView}
        </div>

        {error && (
          <p className="absolute inset-x-0 top-3 px-4 text-center text-xs text-rose-400">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div
      className={[
        'relative min-h-screen w-full text-[var(--aipets-fg)]',
        isDesktop() ? 'bg-transparent' : 'bg-[var(--aipets-bg)]',
      ].join(' ')}
    >
      <div className="relative mx-auto max-w-[1440px] flex flex-col gap-6 px-6 py-8 lg:h-screen">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[var(--aipets-muted)] tracking-[0.3em] uppercase">aipets</p>
            <h1 className="text-2xl font-semibold">aipets Stage</h1>
          </div>

          <Link
            to="/settings"
            className={[
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm',
              'bg-[var(--aipets-card)] text-[var(--aipets-fg)] hover:bg-[var(--aipets-hover)]',
            ].join(' ')}
          >
            <span className="i-solar:settings-bold-duotone" />
            {t('settings.reactShell.openSettings', { defaultValue: 'Settings' })}
          </Link>
        </header>

        <ConfigurationHint />

        <div className="min-h-0 flex flex-1 flex-col gap-6 lg:flex-row">
          <main className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="min-h-0 w-full flex flex-1 flex-wrap items-center justify-center gap-4">
              {enabledInstances.length > 0
                ? enabledInstances.map((entry, index) => {
                    const character = characters.find(item => item.id === entry.characterId)
                    if (!character)
                      return null

                    const isPrimary = primaryInstance?.id === entry.id
                    const single = enabledInstances.length === 1

                    return (
                      <div
                        key={entry.id}
                        className={[
                          'relative flex flex-col gap-1',
                          single ? 'h-[56vh] w-[min(100%,420px)]' : 'h-[42vh] w-[min(100%,320px)]',
                        ].join(' ')}
                        // A smaller number wins when two pets overlap.
                        style={{ zIndex: enabledInstances.length - index }}
                      >
                        <div className="relative min-h-0 flex flex-1 items-center justify-center">
                          {isPrimary
                            ? characterView
                            : (
                                <CharacterStage
                                  manifestUrl={characterManifestUrl(character)}
                                  appearance={entry.appearance}
                                  onError={handleError}
                                />
                              )}
                        </div>
                      </div>
                    )
                  })
                : characterView}
            </div>

            {error && <p className="max-w-md text-center text-sm text-rose-400">{error}</p>}

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--aipets-muted)]">
              <span className="tracking-[0.2em] uppercase">
                {t('settings.reactShell.beatSyncStageTitle', { defaultValue: 'Beat sync' })}
              </span>

              <input
                ref={beatFileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file)
                    void startBeats('file', file)
                }}
              />

              <button
                type="button"
                className={buttonClass}
                disabled={beatStarting}
                onClick={() => void startBeats('microphone')}
              >
                <span className="i-solar:microphone-bold-duotone" />
                {' '}
                {t('settings.reactShell.beatSyncMic', { defaultValue: 'Microphone' })}
              </button>

              <button
                type="button"
                className={buttonClass}
                disabled={beatStarting}
                onClick={() => beatFileRef.current?.click()}
              >
                <span className="i-solar:music-note-bold-duotone" />
                {' '}
                {t('settings.reactShell.beatSyncFile', { defaultValue: 'Audio file' })}
              </button>

              {beatRunning && (
                <button type="button" className={buttonClass} onClick={stopBeats}>
                  <span className="i-solar:stop-bold-duotone" />
                  {' '}
                  {t('settings.reactShell.beatSyncStop', { defaultValue: 'Stop' })}
                </button>
              )}

              <span>
                {t('settings.reactShell.beatSyncMeter', {
                  defaultValue: '{{beats}} beats · {{bpm}} BPM',
                  beats,
                  bpm,
                })}
              </span>
            </div>

            {beatError && <p className="text-xs text-rose-400">{beatError}</p>}
          </main>

          <aside className={[
            'h-[70vh] w-full shrink-0 overflow-hidden rounded-2xl border border-[var(--aipets-border)]',
            'lg:h-auto lg:w-[400px]',
          ].join(' ')}
          >
            <ChatPanel variant="panel" />
          </aside>
        </div>
      </div>
    </div>
  )
}
