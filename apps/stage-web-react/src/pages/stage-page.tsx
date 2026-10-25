import type { AnimationEvent, LoadedPack } from '@proj-airi/character-animation'

import type { LoadedZipPack } from '../animation/zip-pack'
import type { BuiltinCharacter } from '../character/characters'
import type { StageSnapshot } from '../components/character-stage'

import { errorMessageFrom } from '@moeru/std'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { getActivePackId, loadStoredPack, setActivePackId } from '../animation/zip-pack'
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

export function StagePage() {
  const { t } = useTranslation()
  const dispatchRef = useRef<((event: AnimationEvent) => void) | null>(null)

  const [snapshot, setSnapshot] = useState<StageSnapshot>({ base: 'idle', clipId: null })
  const [packLabel, setPackLabel] = useState('Loading...')
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activePack, setActivePack] = useState<LoadedZipPack | null>(null)
  const [characters, setCharacters] = useState<BuiltinCharacter[]>([])
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(() => getActiveCharacterId())
  const [background] = useStoredValue(sceneBackgroundKey, '')

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

  const handleController = useCallback((dispatch: (event: AnimationEvent) => void) => {
    dispatchRef.current = dispatch
    dispatch({ type: 'speaking', value: getSpeaking() })
  }, [])

  const handleSnapshot = useCallback((next: StageSnapshot) => {
    setSnapshot(next)
  }, [])

  const handleReady = useCallback((pack: LoadedPack) => {
    setPackLabel(`${pack.manifest.name} · ${pack.allClips.length} clips`)
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

  const activeCharacter = characters.find(character => character.id === activeCharacterId) ?? null

  const selectCharacter = (character: BuiltinCharacter) => {
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
                      onReady={handleReady}
                      onError={handleError}
                    />
                  )
                : (
                    <CharacterStage
                      manifestUrl={demoManifestUrl}
                      onController={handleController}
                      onSnapshot={handleSnapshot}
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
