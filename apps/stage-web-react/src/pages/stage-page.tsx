import type { AnimationEvent, LoadedPack } from '@proj-airi/character-animation'

import type { LoadedZipPack } from '../animation/zip-pack'
import type { StageSnapshot } from '../components/character-stage'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { getActivePackId, loadStoredPack } from '../animation/zip-pack'
import { CharacterStage } from '../components/character-stage'
import { ChatPanel } from '../components/chat-panel'
import { useStoredValue } from '../settings/persisted'
import { sceneBackgroundKey } from '../settings/scene'
import { getSpeaking, useSpeaking } from '../speech/playback'

const demoManifestUrl = '/animations/demo/manifest.json'

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
  const [background] = useStoredValue(sceneBackgroundKey, '')

  useEffect(() => {
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
            <p className="text-xs text-[var(--airi-muted)] tracking-[0.3em] uppercase">AIRI</p>
            <h1 className="text-2xl font-semibold">React Stage</h1>
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
            {activePack
              ? (
                  <CharacterStage
                    pack={activePack}
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
