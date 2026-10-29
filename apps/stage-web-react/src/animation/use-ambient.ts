import type { AmbientProgram, AmbientStep, AnimationEvent, CharacterCatalog } from '@proj-aipets/character-animation'

import type { DirectorLongAction } from './director'

import {
  ambientPhaseSteps,
  parseAmbientProgram,
  resolveAmbientPhase,
} from '@proj-aipets/character-animation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { requestAmbientProgram, resolveDirectorConnection } from './ambient-director'
import { readAmbientProgramRecord, writeAmbientProgramRecord } from './ambient-store'
import { animationLog } from './animation-log'
import { createDefaultAmbientProgram } from './default-ambient-program'
import { sessionController } from './session-controller'

export interface UseAmbientOptions {
  characterId: string
  characterName: string
  persona: string
  catalog: CharacterCatalog | null
  longActions: DirectorLongAction[]
  /** Sends one event to the animation controller. */
  dispatch: (event: AnimationEvent) => void
  enabled?: boolean
}

export interface AmbientHandle {
  program: AmbientProgram | null
  /** Reports one ended clip. The scheduler advances its own step list. */
  handleClipEnded: (clipId: string) => void
  /** Regenerates the cycle from the current time. */
  reorder: () => void
}

/** Index the scheduler jumps to when the phase already ran for a while. */
function holdIndexOf(steps: AmbientStep[]): number {
  const index = steps.findIndex(step => step.kind === 'hold')
  return index < 0 ? steps.length : index
}

/**
 * Runs the duration based ambient program for one character.
 *
 * All timing is relative. `anchorAt` is the request time and every phase
 * carries a length, so the program has no clock times. A failed refresh keeps
 * the stored program, and the elapsed time alone decides the current phase.
 *
 * Steps advance one at a time. The controller holds one pending event, so the
 * scheduler waits for the clip it sent before it sends the next one. A long
 * action that still runs ends on its own when a later request arrives.
 */
export function useAmbient(options: UseAmbientOptions): AmbientHandle {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [program, setProgram] = useState<AmbientProgram | null>(null)
  const programRef = useRef<AmbientProgram | null>(null)
  const stepsRef = useRef<AmbientStep[]>([])
  const cursorRef = useRef(0)
  const lastClipIdRef = useRef<string | null>(null)
  const holdActiveRef = useRef(false)
  const phaseTimerRef = useRef<number | null>(null)
  const generatingRef = useRef(false)
  const syncedProgramIdRef = useRef<string | null>(null)
  const syncRef = useRef<(reason: string) => void>(() => {})

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimerRef.current === null)
      return
    window.clearTimeout(phaseTimerRef.current)
    phaseTimerRef.current = null
  }, [])

  const sendNext = useCallback(() => {
    const dispatch = optionsRef.current.dispatch

    while (cursorRef.current < stepsRef.current.length) {
      const step = stepsRef.current[cursorRef.current]
      cursorRef.current += 1

      if (step.kind === 'clip') {
        lastClipIdRef.current = step.clipId
        dispatch({ type: 'playClip', clipId: step.clipId })
        return
      }

      const action = optionsRef.current.longActions.find(item => item.id === step.longAction)
      if (!action?.loopClipId)
        continue

      // A looping state clip has no end. The phase timer sends the next phase,
      // and the next entry clip replaces the loop with a crossfade.
      lastClipIdRef.current = null
      holdActiveRef.current = true
      dispatch({ type: 'setState', clipId: action.loopClipId })
      return
    }
  }, [])

  const armPhaseTimer = useCallback(() => {
    clearPhaseTimer()
    const current = programRef.current
    if (!current || optionsRef.current.enabled === false)
      return

    const state = resolveAmbientPhase(current, Date.now())
    if (!state)
      return

    phaseTimerRef.current = window.setTimeout(() => {
      phaseTimerRef.current = null
      syncRef.current('phase-boundary')
    }, state.remainingMs + 50)
  }, [clearPhaseTimer])

  /**
   * Places the scheduler on the phase that covers the current time.
   *
   * A phase that already ran for a while resumes at its hold step. Only a
   * phase that just started plays its entry clips.
   */
  const sync = useCallback((reason: string) => {
    const current = programRef.current
    if (!current || !optionsRef.current.catalog || optionsRef.current.enabled === false)
      return

    const state = resolveAmbientPhase(current, Date.now())
    if (!state)
      return

    const steps = ambientPhaseSteps(state.phase)
    stepsRef.current = steps
    cursorRef.current = state.atStart ? 0 : holdIndexOf(steps)
    lastClipIdRef.current = null

    // A held loop belongs to the previous phase. Clearing it first stops the
    // loop from returning after the next entry clip ends.
    if (holdActiveRef.current) {
      holdActiveRef.current = false
      optionsRef.current.dispatch({ type: 'clearState' })
    }

    animationLog.write('ambient', `sync: ${reason}`, {
      index: state.index,
      cycle: state.cycle,
      atStart: state.atStart,
      steps: steps.length,
      remainingMs: state.remainingMs,
    })

    sendNext()
    armPhaseTimer()
  }, [armPhaseTimer, sendNext])

  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  const applyProgram = useCallback((next: AmbientProgram | null) => {
    programRef.current = next
    setProgram(next)
  }, [])

  const reorder = useCallback(async () => {
    const latest = optionsRef.current
    if (!latest.catalog || latest.enabled === false || generatingRef.current)
      return

    generatingRef.current = true
    const now = Date.now()
    try {
      const connection = resolveDirectorConnection()
      const next = connection
        ? await requestAmbientProgram({
            characterId: latest.characterId,
            characterName: latest.characterName,
            persona: latest.persona,
            now,
            catalog: latest.catalog,
            longActions: latest.longActions,
            connection,
          })
        : null

      if (!next) {
        // A failed refresh keeps the stored program. The phase timer still runs,
        // so the stage stays in the phase the old anchor selects.
        animationLog.write('ambient', 'reorder failed: keep the stored program')
        return
      }

      writeAmbientProgramRecord(latest.characterId, { program: next, generatedAt: now, updatedAt: now })
      applyProgram(next)
    }
    catch (error) {
      animationLog.write('ambient', 'reorder error', { error })
    }
    finally {
      generatingRef.current = false
    }
  }, [applyProgram])

  useEffect(() => {
    const latest = optionsRef.current
    if (!latest.catalog || latest.enabled === false) {
      applyProgram(null)
      return
    }

    const record = readAmbientProgramRecord(latest.characterId)
    const parsed = record ? parseAmbientProgram(record.program) : null
    if (parsed?.ok && parsed.program.characterId === latest.characterId) {
      animationLog.write('ambient', 'restored stored program', {
        programId: parsed.program.programId,
        phases: parsed.program.phases.length,
      })
      applyProgram(parsed.program)
      return
    }

    const now = Date.now()
    const fallback = createDefaultAmbientProgram({ characterId: latest.characterId, now })
    animationLog.write('ambient', 'fallback: default program')
    writeAmbientProgramRecord(latest.characterId, { program: fallback, generatedAt: now, updatedAt: now })
    applyProgram(fallback)
  }, [applyProgram, options.characterId, options.catalog, options.enabled])

  // A new cycle takes over from its own request time.
  useEffect(() => {
    if (!program || program.programId === syncedProgramIdRef.current)
      return

    syncedProgramIdRef.current = program.programId
    sync('program')
  }, [program, sync])

  useEffect(() => {
    if (!options.catalog || options.enabled === false)
      return

    // The restore effect already placed a program in the ref.
    syncedProgramIdRef.current = programRef.current?.programId ?? null
    sync('ready')
    void reorder()

    const unsubscribe = sessionController.subscribe((transition) => {
      if (transition.effects.includes('enter-ambient')) {
        sync('enter-ambient')
        void reorder()
        return
      }

      // A running session owns the stage. The scheduler keeps its cursor and
      // starts again from the current phase when the session ends.
      lastClipIdRef.current = null
      clearPhaseTimer()
    })

    return () => {
      unsubscribe()
      clearPhaseTimer()
    }
  }, [options.catalog, options.enabled, sync, reorder, clearPhaseTimer])

  const handleClipEnded = useCallback((clipId: string) => {
    if (lastClipIdRef.current !== clipId)
      return

    lastClipIdRef.current = null
    sendNext()
  }, [sendNext])

  return { program, handleClipEnded, reorder }
}
