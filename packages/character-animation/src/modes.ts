export type CharacterMode = 'awake' | 'sleepy' | 'sleeping'

/**
 * Slow-changing body values. They accumulate while the app is closed and are
 * caught up from `updatedAt` when it starts again.
 */
export interface DrivesState {
  sleepiness: number
  hunger: number
  energy: number
  updatedAt: number
}

/**
 * Mode is a long-lived behavior state. One-shot clips play inside a mode and
 * return to it when they end.
 */
export interface ModeState {
  mode: CharacterMode
  enteredAt: number
  lastInteractionAt: number
}

export interface ModeContext {
  now: number
  isNight: boolean
  idleMinutes: number
  userPresent: boolean
}

export interface ModeConfig {
  sleepyThreshold: number
  wakeThreshold: number
  sleepThreshold: number
  forcedSleepThreshold: number
  sleepyIdleMinutes: number
  sleepingIdleMinutes: number
  minSleepMs: number
  minSleepyMs: number
  interactionWakeMs: number
}

export type ModeTransition = CharacterMode | null

export interface ModeResolution {
  state: ModeState
  transition: ModeTransition
  reason: string
}

export const defaultModeConfig: ModeConfig = {
  sleepyThreshold: 0.75,
  wakeThreshold: 0.55,
  sleepThreshold: 0.9,
  forcedSleepThreshold: 0.95,
  sleepyIdleMinutes: 20,
  sleepingIdleMinutes: 10,
  minSleepMs: 10 * 60 * 1000,
  minSleepyMs: 2 * 60 * 1000,
  interactionWakeMs: 5 * 1000,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createDrivesState(now: number, initial?: Partial<Omit<DrivesState, 'updatedAt'>>): DrivesState {
  return {
    sleepiness: clamp(initial?.sleepiness ?? 0.2, 0, 1),
    hunger: clamp(initial?.hunger ?? 0.2, 0, 1),
    energy: clamp(initial?.energy ?? 0.8, 0, 1),
    updatedAt: now,
  }
}

/**
 * Advances sleepiness, hunger, and energy by the elapsed wall-clock time.
 *
 * The function derives elapsed time from `updatedAt` so a closed app catches up
 * on restart. Sleep recovers energy and lowers sleepiness.
 */
export function advanceDrives(drives: DrivesState, mode: CharacterMode, now: number): DrivesState {
  const elapsedMs = now - drives.updatedAt
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0)
    return drives

  const hours = elapsedMs / (60 * 60 * 1000)
  const sleeping = mode === 'sleeping'

  return {
    sleepiness: clamp(drives.sleepiness + hours * (sleeping ? -0.18 : 0.05), 0, 1),
    hunger: clamp(drives.hunger + hours * (sleeping ? 0.03 : 0.04), 0, 1),
    energy: clamp(drives.energy + hours * (sleeping ? 0.12 : -0.05), 0, 1),
    updatedAt: now,
  }
}

export function createModeState(now: number, mode: CharacterMode = 'awake'): ModeState {
  return {
    mode,
    enteredAt: now,
    lastInteractionAt: now,
  }
}

export function noteUserInteraction(state: ModeState, now: number): ModeState {
  return { ...state, lastInteractionAt: now }
}

function transitionTo(state: ModeState, mode: CharacterMode, now: number): ModeState {
  return { ...state, mode, enteredAt: now }
}

/**
 * Resolves the next mode from drives, time, and presence.
 *
 * Sleep entry needs time and a high sleepiness value. Sleep exit needs an
 * interaction, morning, or the minimum dwell time. The two thresholds keep the
 * character from flapping between awake and sleeping.
 */
export function resolveMode(
  state: ModeState,
  drives: DrivesState,
  context: ModeContext,
  config: ModeConfig = defaultModeConfig,
): ModeResolution {
  const elapsed = context.now - state.enteredAt

  if (state.mode === 'sleeping') {
    const interactedAfterEntry = state.lastInteractionAt > state.enteredAt
      && context.now - state.lastInteractionAt <= config.interactionWakeMs
    if (interactedAfterEntry) {
      return {
        state: transitionTo(state, 'awake', context.now),
        transition: 'awake',
        reason: 'user-interaction',
      }
    }

    const morning = !context.isNight && drives.sleepiness < config.wakeThreshold && elapsed >= config.minSleepMs
    if (morning) {
      return {
        state: transitionTo(state, 'awake', context.now),
        transition: 'awake',
        reason: 'morning',
      }
    }

    return { state, transition: null, reason: 'sleeping' }
  }

  if (state.mode === 'awake') {
    if (drives.sleepiness >= config.sleepyThreshold) {
      return {
        state: transitionTo(state, 'sleepy', context.now),
        transition: 'sleepy',
        reason: 'sleepy-drive',
      }
    }

    if (context.isNight && context.idleMinutes >= config.sleepyIdleMinutes) {
      return {
        state: transitionTo(state, 'sleepy', context.now),
        transition: 'sleepy',
        reason: 'night-idle',
      }
    }

    return { state, transition: null, reason: 'awake' }
  }

  if (elapsed < config.minSleepyMs)
    return { state, transition: null, reason: 'sleepy-dwell' }

  if (drives.sleepiness >= config.forcedSleepThreshold) {
    return {
      state: transitionTo(state, 'sleeping', context.now),
      transition: 'sleeping',
      reason: 'forced-sleep',
    }
  }

  if (context.isNight && drives.sleepiness >= config.sleepThreshold && context.idleMinutes >= config.sleepingIdleMinutes) {
    return {
      state: transitionTo(state, 'sleeping', context.now),
      transition: 'sleeping',
      reason: 'night-sleep',
    }
  }

  if (drives.sleepiness < config.wakeThreshold && (!context.isNight || context.idleMinutes < config.sleepyIdleMinutes)) {
    return {
      state: transitionTo(state, 'awake', context.now),
      transition: 'awake',
      reason: 'recovered',
    }
  }

  return { state, transition: null, reason: 'sleepy' }
}
