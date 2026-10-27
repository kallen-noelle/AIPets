import type {
  ActionSequence,
  AffectLabel,
  AnimationClockPort,
  AnimationEvent,
  CharacterCatalog,
  LoadedPack,
  PerformanceCue,
  PerformancePlan,
  PlanAnchor,
  PlanTimelineMark,
} from '@proj-airi/character-animation'

import type { DirectorLongAction } from '../animation/director'
import type { DirectorAutonomy } from '../animation/director-config'
import type { LoadedZipPack } from '../animation/zip-pack'
import type { BuiltinCharacter, CharacterAppearance, CharacterAppearanceOverride } from '../character/characters'
import type { StageSnapshot } from '../components/character-stage'

import { errorMessageFrom } from '@moeru/std'
import { resolvePlanArrival, validatePerformancePlan } from '@proj-airi/character-animation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { animationLog } from '../animation/animation-log'
import { describeLongActions } from '../animation/director'
import { directorBus } from '../animation/director-bus'
import { cueLimitFor, directorAutonomyKey, directorDefaults, directorMaxCuesKey } from '../animation/director-config'
import { recordClipPlayed } from '../animation/playback-history'
import { sessionController, useSessionPhase } from '../animation/session-controller'
import { useAmbient } from '../animation/use-ambient'
import { WaitingSequenceRunner } from '../animation/waiting-sequence'
import { getActivePackId, loadStoredPack, setActivePackId } from '../animation/zip-pack'
import { affectStore, useAffect } from '../character/affect-store'
import {
  applyCharacterPersona,
  characterAppearanceOverrideKey,
  characterEnabledKey,
  characterManifestUrl,
  defaultCharacterAppearance,
  getActiveCharacterId,
  loadBuiltinCharacters,
  loadCharacterPersona,
  setActiveCharacterId as persistActiveCharacterId,
} from '../character/characters'
import { characterPersonaKey } from '../chat/types'
import { AnimationLogPanel } from '../components/animation-log-panel'
import { CharacterStage } from '../components/character-stage'
import { ChatPanel } from '../components/chat-panel'
import { DirectorMonitorPanel } from '../components/director-monitor-panel'
import { isDesktop } from '../desktop/bridge'
import { readStored, useStoredValue } from '../settings/persisted'
import { sceneBackgroundKey } from '../settings/scene'
import { getSpeaking, useSpeaking } from '../speech/playback'

const demoManifestUrl = './animations/demo/manifest.json'

/** Stable fallback for the appearance override store. */
const emptyAppearanceOverride: CharacterAppearanceOverride = {}

/** Applies the card page overrides on top of the look a character ships. */
function withAppearanceOverride(
  appearance: CharacterAppearance,
  override: CharacterAppearanceOverride,
): CharacterAppearance {
  return { ...appearance, ...override }
}

const buttonClass = [
  'rounded-full px-4 py-2 text-sm font-medium transition',
  'bg-[var(--airi-card)] text-[var(--airi-fg)] hover:bg-[var(--airi-hover)] active:scale-95',
].join(' ')

const debugButtonClass = [
  buttonClass,
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ')

const debugAnchors: PlanAnchor[] = [
  { type: 'replyStart' },
  { type: 'sentence', index: 1 },
  { type: 'afterSpeech' },
]

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

function createDebugPlan(catalog: CharacterCatalog): PerformancePlan {
  const used = new Set<string>()
  const cues: PerformanceCue[] = []
  const preferredTags = [['shy'], ['happy'], ['polite']]

  for (const tags of preferredTags) {
    if (cues.length >= debugAnchors.length)
      break

    const clip = catalog.clips.find(candidate =>
      !used.has(candidate.id) && tags.some(tag => candidate.tags.includes(tag)),
    )
    if (!clip)
      continue

    used.add(clip.id)
    cues.push({
      anchor: debugAnchors[cues.length] ?? { type: 'afterSpeech' },
      clipId: clip.id,
      intensity: 0.7,
    })
  }

  for (const clip of catalog.clips) {
    if (cues.length >= debugAnchors.length)
      break
    if (used.has(clip.id) || clip.role === 'loop')
      continue

    used.add(clip.id)
    cues.push({
      anchor: debugAnchors[cues.length] ?? { type: 'afterSpeech' },
      clipId: clip.id,
      intensity: 0.7,
    })
  }

  return {
    affect: { valence: 0.05, arousal: 0.03 },
    cues,
  }
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

export function StagePage() {
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
  const [snapshot, setSnapshot] = useState<StageSnapshot>({
    base: 'idle',
    clipId: null,
    longActionName: null,
    longActionPhase: null,
    waiting: false,
  })
  const [packLabel, setPackLabel] = useState('Loading...')
  const [catalog, setCatalog] = useState<CharacterCatalog | null>(null)
  const [planText, setPlanText] = useState('')
  const [planIssues, setPlanIssues] = useState<string[]>([])
  const [longActionName, setLongActionName] = useState('放风筝')
  const [longActionDurationMs, setLongActionDurationMs] = useState('30000')
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activePack, setActivePack] = useState<LoadedZipPack | null>(null)
  const [packLongActions, setPackLongActions] = useState<DirectorLongAction[]>([])
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(() => getActiveCharacterId())
  const [speechBubble, setSpeechBubble] = useState<string | null>(null)
  const speechBubbleTimerRef = useRef<number | null>(null)
  const [background] = useStoredValue(sceneBackgroundKey, '')
  const [characterEnabled] = useStoredValue(characterEnabledKey, true)
  const [appearanceOverride] = useStoredValue<CharacterAppearanceOverride>(
    characterAppearanceOverrideKey,
    emptyAppearanceOverride,
  )

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
  const activeCharacterName = characters.find(character => character.id === activeCharacterId)?.name
    ?? activePack?.profile.name
    ?? 'aipetdex'
  const persona = readStored(characterPersonaKey, '')

  useEffect(() => {
    let disposed = false

    void loadBuiltinCharacters()
      .then((next) => {
        if (disposed)
          return

        setCharacters(next)

        const stored = getActiveCharacterId()
        if (stored && !next.some(character => character.id === stored)) {
          persistActiveCharacterId(null)
          setActiveCharacterId(null)
        }
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
    const unsubscribe = directorBus.subscribeEvents((event) => {
      dispatchRef.current?.(event)
    })

    return () => {
      unsubscribe()
      directorBus.setContext({ active: false })
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
    if (ambient.program || sessionPhase !== 'ambient' || !catalog || !affectLabel || speaking || thinking || paused || voiceSpeaking)
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
  }, [ambient.program, sessionPhase, catalog, affectLabel, speaking, thinking, paused, voiceSpeaking, playClip])

  const handleController = useCallback((dispatch: (event: AnimationEvent) => void) => {
    dispatchRef.current = dispatch
    dispatch({ type: 'speaking', value: getSpeaking() })
  }, [])

  const handleSnapshot = useCallback((next: StageSnapshot) => {
    snapshotRef.current = next
    setSnapshot(next)

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
    setPackLabel(`${pack.manifest.name} · ${pack.allClips.length} clips`)
    setCatalog(nextCatalog ?? null)
    // Built-in characters arrive through this callback, not through
    // `activePack`. Reading long actions from the pack keeps the director prompt
    // complete for them too.
    setPackLongActions(describeLongActions(pack.longActions))
    setPlanText(nextCatalog ? JSON.stringify(createDebugPlan(nextCatalog), null, 2) : '')
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

  const send = (event: AnimationEvent) => dispatchRef.current?.(event)

  const toggleSpeaking = () => {
    const next = !speaking
    setSpeaking(next)
    setThinking(false)
    send({ type: 'speaking', value: next })
  }

  const toggleThinking = () => {
    const next = !thinking
    setThinking(next)
    setSpeaking(false)
    send({ type: 'thinking', value: next })
  }

  const togglePaused = () => {
    const next = !paused
    setPaused(next)
    send({ type: 'paused', value: next })
  }

  const backToIdle = () => {
    setSpeaking(false)
    setThinking(false)
    setPaused(false)
    send({ type: 'paused', value: false })
    send({ type: 'idle' })
  }

  const stopPlan = useCallback(() => {
    for (const id of planTimersRef.current)
      window.clearTimeout(id)
    planTimersRef.current = []
    pendingCuesRef.current = []
    setPlanIssues([])
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
          // The debug panel and cold starts have no reply marks yet. Play in
          // plan order instead of parking every cue as a future anchor.
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
    setPlanIssues(decision.dropped.map(item => `${item.clipId}: ${item.reason}`))

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
      const autonomy = readStored<DirectorAutonomy>(directorAutonomyKey, directorDefaults.autonomy)
      const configuredMax = readStored(directorMaxCuesKey, directorDefaults.maxCues)
      const validation = validatePerformancePlan(plan, {
        catalog,
        maxCues: cueLimitFor(autonomy, configuredMax),
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

  const runLongAction = () => {
    const name = longActionName.trim()
    if (!name)
      return

    const duration = Number(longActionDurationMs)
    send({
      type: 'action',
      name,
      durationMs: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    })
  }

  const runPlan = () => {
    if (!catalog)
      return

    let input: unknown
    try {
      input = JSON.parse(planText)
    }
    catch {
      setPlanIssues(['Plan is not valid JSON'])
      return
    }

    const validation = validatePerformancePlan(input, { catalog })
    if (!validation.ok || !validation.plan) {
      setPlanIssues(validation.issues)
      return
    }

    executePlan(validation.plan)
    setPlanIssues(validation.issues)
  }

  const activeCharacter = characters.find(character => character.id === activeCharacterId) ?? null

  const selectCharacter = (character: BuiltinCharacter) => {
    // Re-selecting the active character must not clear the catalog.
    // `CharacterStage` keeps the same manifestUrl, so it does not reload and
    // `onReady` never fires again. A cleared catalog would stay null.
    if (character.id === activeCharacterId && catalog) {
      animationLog.write('stage', `character already active: ${character.id}`)
      return
    }

    animationLog.write('stage', `switch character: ${character.id}`)
    stopPlan()
    setCatalog(null)
    setPackLongActions([])
    setPlanText('')
    setPlanIssues([])
    persistActiveCharacterId(character.id)
    setActiveCharacterId(character.id)
    activePack?.dispose()
    setActivePack(null)
    setActivePackId(null)
    setError(null)
    setSpeaking(false)
    setThinking(false)
    setPaused(false)

    void loadCharacterPersona(character)
      .then((persona) => {
        if (persona)
          applyCharacterPersona(persona)
      })
      .catch((personaError: unknown) => {
        setError(errorMessageFrom(personaError) ?? 'Cannot load the character persona')
      })
  }

  return (
    <div
      className={[
        'relative min-h-screen w-full text-[var(--airi-fg)]',
        isDesktop() ? 'bg-transparent' : 'bg-[var(--airi-bg)]',
      ].join(' ')}
    >
      {background && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${background})` }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[var(--airi-bg)]/60" />
        </>
      )}

      <div className="relative mx-auto max-w-[1440px] flex flex-col gap-6 px-6 py-8 lg:h-screen">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[var(--airi-muted)] tracking-[0.3em] uppercase">aipetdex</p>
            <h1 className="text-2xl font-semibold">aipetdex Stage</h1>
            <p className="text-sm text-[var(--airi-muted)]">{packLabel}</p>
          </div>

          <Link
            to="/settings"
            className={[
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm',
              'bg-[var(--airi-card)] text-[var(--airi-fg)] hover:bg-[var(--airi-hover)]',
            ].join(' ')}
          >
            <span className="i-solar:settings-bold-duotone" />
            {t('settings.reactShell.openSettings', { defaultValue: 'Settings' })}
          </Link>
        </header>

        <div className="min-h-0 flex flex-1 flex-col gap-6 lg:flex-row">
          <main className="flex flex-1 flex-col items-center justify-center gap-6">
            {characters.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {characters.map((character) => {
                  const active = character.id === activeCharacterId

                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => selectCharacter(character)}
                      style={active ? { borderColor: character.accent, color: character.accent } : undefined}
                      className={[
                        'rounded-full border px-4 py-1.5 text-xs transition',
                        active
                          ? 'bg-[var(--airi-card)]'
                          : 'border-[var(--airi-border)] bg-[var(--airi-card)] text-[var(--airi-fg)] hover:bg-[var(--airi-hover)]',
                      ].join(' ')}
                    >
                      {character.name}
                    </button>
                  )
                })}
              </div>
            )}

            {!characterEnabled
              ? (
                  <p className="max-w-md text-center text-sm text-[var(--airi-muted)]">
                    {t('settings.reactShell.stageCharacterHidden', {
                      defaultValue: 'The character is hidden. Enable it on the Card settings page.',
                    })}
                  </p>
                )
              : activeCharacter
                ? (
                    <CharacterStage
                      manifestUrl={characterManifestUrl(activeCharacter)}
                      appearance={withAppearanceOverride(activeCharacter.appearance, appearanceOverride)}
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
                        pack={activePack}
                        appearance={withAppearanceOverride(activePack.profile.appearance, appearanceOverride)}
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
                        manifestUrl={demoManifestUrl}
                        appearance={withAppearanceOverride(defaultCharacterAppearance, appearanceOverride)}
                        onController={handleController}
                        onSnapshot={handleSnapshot}
                        onUserClick={handleUserClick}
                        onReady={handleReady}
                        onClipEnded={ambient.handleClipEnded}
                        onError={handleError}
                        speechText={speechBubble}
                      />
                    )}

            {error
              ? <p className="max-w-md text-center text-sm text-rose-400">{error}</p>
              : (
                  <p className="text-xs text-[var(--airi-muted)]">
                    chain
                    {' '}
                    <span className="text-[var(--airi-fg)]">{snapshot.base}</span>
                    {' · '}
                    clip
                    {' '}
                    <span className="text-[var(--airi-fg)]">{snapshot.clipId ?? 'none'}</span>
                  </p>
                )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" className={buttonClass} onClick={backToIdle}>Idle</button>
              <button type="button" className={buttonClass} onClick={toggleSpeaking}>
                {speaking ? 'Stop talking' : 'Talk'}
              </button>
              <button type="button" className={buttonClass} onClick={toggleThinking}>
                {thinking ? 'Stop thinking' : 'Think'}
              </button>
              <button type="button" className={buttonClass} onClick={() => send({ type: 'emotion', emotion: 'happy', intensity: 0.9 })}>
                Happy
              </button>
              <button type="button" className={buttonClass} onClick={() => send({ type: 'click', area: 'body' })}>
                Poke
              </button>
              <button type="button" className={buttonClass} onClick={togglePaused}>
                {paused ? 'Resume' : 'Pause'}
              </button>
            </div>

            <details className={[
              'w-full max-w-xl rounded-2xl border p-4 text-sm',
              'border-[var(--airi-border)] bg-[var(--airi-card)]/80',
            ].join(' ')}
            >
              <summary className="cursor-pointer text-[var(--airi-muted)]">
                Animation plan debug
                {' · '}
                {catalog ? `${catalog.clips.length} semantic clips` : 'no catalog'}
              </summary>

              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--airi-muted)]">
                  <span>
                    mood
                    {' '}
                    <span className="text-[var(--airi-fg)]">{affect.state?.label ?? 'none'}</span>
                  </span>
                  <span>
                    v
                    {' '}
                    {affect.state ? affect.state.valence.toFixed(2) : '—'}
                  </span>
                  <span>
                    a
                    {' '}
                    {affect.state ? affect.state.arousal.toFixed(2) : '—'}
                  </span>
                  <span>
                    affinity
                    {' '}
                    {affect.state ? Math.round(affect.state.affinity) : '—'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={debugButtonClass} onClick={() => affectStore.applyEvent('praise')}>
                    Praise
                  </button>
                  <button type="button" className={debugButtonClass} onClick={() => affectStore.applyEvent('insult')}>
                    Scold
                  </button>
                  <button type="button" className={debugButtonClass} onClick={() => affectStore.reset()}>
                    Reset mood
                  </button>
                </div>

                <textarea
                  className={[
                    'min-h-40 w-full resize-y rounded-xl border p-3 font-mono text-xs',
                    'border-[var(--airi-border)] bg-[var(--airi-bg)] text-[var(--airi-fg)]',
                  ].join(' ')}
                  value={planText}
                  onChange={event => setPlanText(event.target.value)}
                  spellCheck={false}
                  placeholder={catalog ? 'Paste a performance plan JSON' : 'Load a pack with catalog.json'}
                  disabled={!catalog}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={debugButtonClass} onClick={runPlan} disabled={!catalog}>
                    Run plan
                  </button>
                  <button type="button" className={debugButtonClass} onClick={stopPlan}>
                    Stop plan
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="w-36 border border-[var(--airi-border)] rounded-xl bg-[var(--airi-bg)] px-3 py-2 text-xs text-[var(--airi-fg)] font-mono"
                    value={longActionName}
                    onChange={event => setLongActionName(event.target.value)}
                    placeholder="Long action name"
                    spellCheck={false}
                  />
                  <input
                    className="w-24 border border-[var(--airi-border)] rounded-xl bg-[var(--airi-bg)] px-3 py-2 text-xs text-[var(--airi-fg)] font-mono"
                    value={longActionDurationMs}
                    onChange={event => setLongActionDurationMs(event.target.value)}
                    inputMode="numeric"
                  />
                  <button type="button" className={debugButtonClass} onClick={runLongAction} disabled={!catalog}>
                    Run long action
                  </button>
                  <button type="button" className={debugButtonClass} onClick={() => send({ type: 'longActionStop' })}>
                    Stop long action
                  </button>
                </div>

                {planIssues.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs text-rose-400">
                    {planIssues.map((issue, index) => (
                      <li key={`${index}-${issue}`}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            </details>

            <AnimationLogPanel />
            <DirectorMonitorPanel />
          </main>

          <aside className={[
            'h-[70vh] w-full shrink-0 overflow-hidden rounded-2xl border border-[var(--airi-border)]',
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
