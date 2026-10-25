import { describe, expect, it } from 'vitest'

import {
  advanceDrives,
  createDrivesState,
  createModeState,
  noteUserInteraction,
  resolveMode,
} from './modes'

const minute = 60 * 1000
const hour = 60 * minute
const night = 23 * hour

describe('modes', () => {
  it('enters sleepy from a high sleepiness drive', () => {
    const result = resolveMode(
      createModeState(night),
      createDrivesState(night, { sleepiness: 0.8 }),
      { now: night, isNight: true, idleMinutes: 5, userPresent: false },
    )

    expect(result.transition).toBe('sleepy')
    expect(result.state.mode).toBe('sleepy')
  })

  it('enters sleeping at night after the sleepy dwell time', () => {
    const sleepy = resolveMode(
      createModeState(night),
      createDrivesState(night, { sleepiness: 0.8 }),
      { now: night, isNight: true, idleMinutes: 25, userPresent: false },
    )
    expect(sleepy.transition).toBe('sleepy')

    const later = night + 3 * minute
    const sleeping = resolveMode(
      sleepy.state,
      createDrivesState(later, { sleepiness: 0.92 }),
      { now: later, isNight: true, idleMinutes: 28, userPresent: false },
    )

    expect(sleeping.transition).toBe('sleeping')
    expect(sleeping.reason).toBe('night-sleep')
  })

  it('wakes on a user interaction after sleep', () => {
    const sleepingState = {
      ...createModeState(night - 20 * minute, 'sleeping'),
    }
    const interaction = noteUserInteraction(sleepingState, night)
    const result = resolveMode(
      interaction,
      createDrivesState(night, { sleepiness: 0.9 }),
      { now: night, isNight: true, idleMinutes: 0, userPresent: true },
    )

    expect(result.transition).toBe('awake')
    expect(result.reason).toBe('user-interaction')
  })

  it('wakes in the morning after the minimum sleep time', () => {
    const enteredAt = night - 10 * hour
    const now = enteredAt + 11 * minute
    const sleepingState = {
      ...createModeState(enteredAt, 'sleeping'),
      lastInteractionAt: enteredAt - minute,
    }

    const result = resolveMode(
      sleepingState,
      createDrivesState(now, { sleepiness: 0.2 }),
      { now, isNight: false, idleMinutes: 600, userPresent: false },
    )

    expect(result.transition).toBe('awake')
    expect(result.reason).toBe('morning')
  })

  it('catches up drives from elapsed time', () => {
    const start = createDrivesState(night)
    const next = advanceDrives(start, 'awake', night + 10 * hour)

    expect(next.sleepiness).toBeCloseTo(0.7, 5)
    expect(next.hunger).toBeCloseTo(0.6, 5)
    expect(next.energy).toBeCloseTo(0.3, 5)
  })
})
