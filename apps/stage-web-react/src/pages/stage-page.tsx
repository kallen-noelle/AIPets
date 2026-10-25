import type {
  AffectLabel,
  AnimationClockPort,
  AnimationEvent,
  CharacterCatalog,
  LoadedPack,
  PerformanceCue,
  PerformancePlan,
  PlanAnchor,
} from '@proj-airi/character-animation'

import type { LoadedZipPack } from '../animation/zip-pack'
import type { BuiltinCharacter } from '../character/characters'
import type { StageSnapshot } from '../components/character-stage'

import { errorMessageFrom } from '@moeru/std'
import { PerformancePlanExecutor, validatePerformancePlan } from '@proj-airi/character-animation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { getActivePackId, loadStoredPack, setActivePackId } from '../animation/zip-pack'
import { affectStore, useAffect } from '../character/affect-store'
import {
  applyCharacterPersona,
  characterManifestUrl,
  getActiveCharacterId,
  loadBuiltinCharacters,
  loadCharacterPersona,
  setActiveCharacterId as persistActiveCharacterId,
} from '../character/characters'
import { CharacterStage } from '../components/character-stage'
import { ChatPanel } from '../components/chat-panel'
import { useStoredValue } from '../settings/persisted'
import { sceneBackgroundKey } from '../settings/scene'
import { getSpeaking, useSpeaking } from '../speech/playback'

const demoManifestUrl = './animations/demo/manifest.json'

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
  const executorRef = useRef<PerformancePlanExecutor | null>(null)
  const planTimersRef = useRef<number[]>([])
  const planCooldownUntilRef = useRef(0)

  const [snapshot, setSnapshot] = useState<StageSnapshot>({ base: 'idle', clipId: null })
  const [packLabel, setPackLabel] = useState('Loading...')
  const [catalog, setCatalog] = useState<CharacterCatalog | null>(null)
  const [planText, setPlanText] = useState('')
  const [planIssues, setPlanIssues] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activePack, setActivePack] = useState<LoadedZipPack | null>(null)
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(() => getActiveCharacterId())
  const [background] = useStoredValue(sceneBackgroundKey, '')

  const characterId = activeCharacterId ?? activePack?.pack.manifest.id ?? 'demo'
  const affect = useAffect(characterId)
  const affectLabel = affect.state?.label ?? null

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
    if (!catalog || !affectLabel || speaking || thinking || paused || voiceSpeaking)
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
        dispatchRef.current?.({ type: 'playClip', clipId: clip.id })
    }, ambientIntervals[affectLabel])

    return () => window.clearInterval(timer)
  }, [catalog, affectLabel, speaking, thinking, paused, voiceSpeaking])

  const handleController = useCallback((dispatch: (event: AnimationEvent) => void) => {
    dispatchRef.current = dispatch
    dispatch({ type: 'speaking', value: getSpeaking() })
  }, [])

  const handleSnapshot = useCallback((next: StageSnapshot) => {
    setSnapshot(next)
  }, [])

  const handleClipEnded = useCallback((clipId: string) => {
    const executor = executorRef.current
    if (!executor)
      return

    const result = executor.notifyClipEnded(clipId)
    for (const cue of result.cues)
      dispatchRef.current?.({ type: 'playClip', clipId: cue.clipId })
  }, [])

  const handleUserClick = useCallback(() => {
    affectStore.applyEvent('click')
  }, [])

  const handleReady = useCallback((pack: LoadedPack, nextCatalog?: CharacterCatalog) => {
    setPackLabel(`${pack.manifest.name} · ${pack.allClips.length} clips`)
    setCatalog(nextCatalog ?? null)
    setPlanText(nextCatalog ? JSON.stringify(createDebugPlan(nextCatalog), null, 2) : '')
  }, [])

  useEffect(() => {
    return () => {
      executorRef.current?.interrupt()
      for (const id of planTimersRef.current)
        window.clearTimeout(id)
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
    executorRef.current?.interrupt()
    executorRef.current = null
    for (const id of planTimersRef.current)
      window.clearTimeout(id)
    planTimersRef.current = []
    setPlanIssues([])
    planCooldownUntilRef.current = 0
  }, [])

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

    stopPlan()
    setPlanIssues(validation.issues)

    const executor = new PerformancePlanExecutor({
      clock: createBrowserClock(),
      catalog,
      onCue: cue => dispatchRef.current?.({ type: 'playClip', clipId: cue.clipId }),
    })
    executorRef.current = executor
    executor.start(validation.plan)
    planCooldownUntilRef.current = Date.now() + 6000

    const apply = (cues: PerformanceCue[]) => {
      for (const cue of cues)
        dispatchRef.current?.({ type: 'playClip', clipId: cue.clipId })
    }

    apply(executor.handle({ type: 'replyStart' }).cues)
    planTimersRef.current.push(window.setTimeout(() => {
      apply(executor.handle({ type: 'sentence', index: 1 }).cues)
    }, 1200))
    planTimersRef.current.push(window.setTimeout(() => {
      apply(executor.handle({ type: 'sentence', index: 2 }).cues)
    }, 2400))
    planTimersRef.current.push(window.setTimeout(() => {
      apply(executor.handle({ type: 'speechEnd' }).cues)
    }, 3600))
  }

  const activeCharacter = characters.find(character => character.id === activeCharacterId) ?? null

  const selectCharacter = (character: BuiltinCharacter) => {
    stopPlan()
    setCatalog(null)
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
    <div className="relative min-h-screen w-full bg-[var(--airi-bg)] text-[var(--airi-fg)]">
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

            {activeCharacter
              ? (
                  <CharacterStage
                    manifestUrl={characterManifestUrl(activeCharacter)}
                    appearance={activeCharacter.appearance}
                    onController={handleController}
                    onSnapshot={handleSnapshot}
                    onClipEnded={handleClipEnded}
                    onUserClick={handleUserClick}
                    onReady={handleReady}
                    onError={handleError}
                  />
                )
              : activePack
                ? (
                    <CharacterStage
                      pack={activePack}
                      appearance={activePack.profile.appearance}
                      onController={handleController}
                      onSnapshot={handleSnapshot}
                      onClipEnded={handleClipEnded}
                      onUserClick={handleUserClick}
                      onReady={handleReady}
                      onError={handleError}
                    />
                  )
                : (
                    <CharacterStage
                      manifestUrl={demoManifestUrl}
                      onController={handleController}
                      onSnapshot={handleSnapshot}
                      onClipEnded={handleClipEnded}
                      onUserClick={handleUserClick}
                      onReady={handleReady}
                      onError={handleError}
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

                {planIssues.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs text-rose-400">
                    {planIssues.map((issue, index) => (
                      <li key={`${index}-${issue}`}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
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
