import type { CharacterCatalog, DayPlan, DayPlanBlock } from '@proj-airi/character-animation'

import type { DirectorLongAction } from './director'

import {
  createRuleBasedDayPlan,
  currentDayPlanBlock,
  isDayPlanExpired,
  isDayPlanThrottled,
  mergeDayPlan,
  validateDayPlan,
} from '@proj-airi/character-animation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { affectStore } from '../character/affect-store'
import { animationLog } from './animation-log'
import { requestDayPlan, resolveDirectorConnection } from './day-plan-director'
import { readDayPlanRecord, writeDayPlanRecord } from './day-plan-store'
import { sessionController } from './session-controller'

export interface UseDayPlanOptions {
  characterId: string
  characterName: string
  persona: string
  catalog: CharacterCatalog | null
  longActions: DirectorLongAction[]
  enabled?: boolean
}

export interface DayPlanHandle {
  plan: DayPlan | null
  /** The block that covers the current time, if any. */
  block: DayPlanBlock | null
  /** Regenerates the future part after a session ends. */
  reorder: () => void
}

function localTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone || 'UTC'
}

/**
 * Loads, generates, and refreshes the day plan for one character.
 *
 * The stored plan wins when it is still valid. Otherwise the hook asks the
 * model for a coarse schedule and falls back to the rule-based plan. Generation
 * is throttled, so a burst of session ends cannot flood the provider.
 */
export function useDayPlan(options: UseDayPlanOptions): DayPlanHandle {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const planRef = useRef<DayPlan | null>(null)
  const generatingRef = useRef(false)
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [block, setBlock] = useState<DayPlanBlock | null>(null)

  const applyPlan = useCallback((next: DayPlan | null) => {
    planRef.current = next
    setPlan(next)
  }, [])

  const generate = useCallback(async () => {
    const latest = optionsRef.current
    if (!latest.catalog || latest.enabled === false || generatingRef.current)
      return

    const now = Date.now()
    const record = readDayPlanRecord(latest.characterId)
    if (isDayPlanThrottled(record?.lastGeneratedAt, now)) {
      animationLog.write('day-plan', 'skip: throttled', {
        lastGeneratedAt: record?.lastGeneratedAt,
        now,
      })
      return
    }

    generatingRef.current = true
    const timezone = localTimezone()
    const shortActionIds = latest.catalog.clips
      .filter(clip => clip.role !== 'loop')
      .map(clip => clip.id)
    const longActionIds = latest.longActions.map(action => action.id)
    const connection = resolveDirectorConnection()

    try {
      let next: DayPlan | null = null
      if (connection) {
        const result = await requestDayPlan({
          characterId: latest.characterId,
          characterName: latest.characterName,
          persona: latest.persona,
          affect: affectStore.snapshot.state ?? null,
          timezone,
          now,
          clips: latest.catalog.clips,
          longActionIds,
          userPresent: sessionController.phase !== 'ambient',
          connection,
        })
        next = result?.plan ?? null
      }

      if (!next) {
        next = createRuleBasedDayPlan({
          characterId: latest.characterId,
          now,
          timezone,
          shortActionIds,
          longActionIds,
        })
        animationLog.write('day-plan', 'fallback: rule-based plan', { blocks: next.blocks.length })
      }

      const merged = mergeDayPlan(planRef.current, next, now)
      writeDayPlanRecord(latest.characterId, {
        plan: merged,
        lastGeneratedAt: now,
        updatedAt: now,
      })
      applyPlan(merged)
    }
    catch (error) {
      animationLog.write('day-plan', 'generate failed', { error })
    }
    finally {
      generatingRef.current = false
    }
  }, [applyPlan])

  useEffect(() => {
    const latest = optionsRef.current
    if (!latest.catalog || latest.enabled === false) {
      applyPlan(null)
      return
    }

    const record = readDayPlanRecord(latest.characterId)
    const availableActionIds = [
      ...latest.catalog.clips.map(clip => clip.id),
      ...latest.longActions.map(action => action.id),
    ]
    const validation = record
      ? validateDayPlan(record.plan, {
          characterId: latest.characterId,
          availableActionIds,
          maxBlocks: 10,
        })
      : null

    if (validation?.ok && validation.plan) {
      animationLog.write('day-plan', 'restored stored plan', {
        blocks: validation.plan.blocks.length,
        planId: validation.plan.planId,
      })
      applyPlan(validation.plan)
      return
    }

    void generate()
  }, [applyPlan, generate, options.characterId, options.catalog, options.enabled])

  useEffect(() => {
    if (!plan)
      return

    const update = () => {
      const now = Date.now()
      if (isDayPlanExpired(plan, now))
        void generate()
      else
        setBlock(currentDayPlanBlock(plan, now))
    }

    update()
    const timer = window.setInterval(update, 20_000)
    return () => window.clearInterval(timer)
  }, [generate, plan])

  const reorder = useCallback(() => {
    void generate()
  }, [generate])

  return { plan, block, reorder }
}
