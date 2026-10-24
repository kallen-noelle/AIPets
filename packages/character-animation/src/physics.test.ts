import { describe, expect, it } from 'vitest'

import {
  clampPetPosition,
  createPetPhysicalState,
  defaultPetPhysicsOptions,
  flingPetPhysicalState,
  stepPetPhysics,
} from './physics'

const wideBounds = { minX: -10_000, maxX: 10_000, minY: -10_000, maxY: 10_000 }

describe('pet physics', () => {
  it('keeps a resting pet still', () => {
    const state = createPetPhysicalState({ x: 40, y: 60 })
    const next = stepPetPhysics(state, { x: 40, y: 60 }, 1 / 60, wideBounds)

    expect(next.position).toEqual({ x: 40, y: 60 })
    expect(next.velocity).toEqual({ x: 0, y: 0 })
  })

  it('pulls a displaced pet toward the anchor', () => {
    const state = createPetPhysicalState({ x: 100, y: 0 })
    const next = stepPetPhysics(state, { x: 0, y: 0 }, 1 / 30, wideBounds)

    expect(next.velocity.x).toBeLessThan(0)
    expect(next.position.x).toBeLessThan(100)
    expect(next.position.x).toBeGreaterThan(0)
  })

  it('damps velocity over time', () => {
    const state = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 } }
    const next = stepPetPhysics(state, { x: 0, y: 0 }, 0.1, wideBounds)

    expect(next.velocity.x).toBeLessThan(100)
    expect(next.velocity.x).toBeGreaterThan(0)
  })

  it('bounces off a bound and keeps part of the speed', () => {
    const state = { position: { x: 0, y: 0 }, velocity: { x: -100, y: 0 } }
    const bounds = { minX: 0, maxX: 1000, minY: -10_000, maxY: 10_000 }
    const next = stepPetPhysics(state, { x: 0, y: 0 }, 0.1, bounds)

    // The step is clamped to `maxStepSeconds` before the damping is applied.
    const damped = 100 * Math.exp(-defaultPetPhysicsOptions.friction * defaultPetPhysicsOptions.maxStepSeconds)
    expect(next.position.x).toBe(0)
    expect(next.velocity.x).toBeGreaterThan(0)
    expect(next.velocity.x).toBeCloseTo(damped * defaultPetPhysicsOptions.restitution, 3)
  })

  it('clamps a long step so the pet cannot jump across the screen', () => {
    const state = createPetPhysicalState({ x: 500, y: 0 })
    const next = stepPetPhysics(state, { x: 0, y: 0 }, 10, wideBounds)

    expect(Number.isFinite(next.position.x)).toBe(true)
    expect(next.position.x).toBeGreaterThan(0)
    expect(next.position.x).toBeLessThan(500)
    expect(Math.abs(next.velocity.x)).toBeLessThan(600)
  })

  it('ignores a negative step', () => {
    const state = { position: { x: 10, y: 10 }, velocity: { x: 5, y: 5 } }
    const next = stepPetPhysics(state, { x: 0, y: 0 }, -1, wideBounds)

    expect(next).toEqual(state)
  })

  it('caps a flick speed', () => {
    const state = createPetPhysicalState({ x: 0, y: 0 })
    const flung = flingPetPhysicalState(state, { x: 9000, y: 0 }, 2400)

    expect(Math.hypot(flung.velocity.x, flung.velocity.y)).toBeCloseTo(2400, 5)
    expect(flung.position).toEqual(state.position)
  })

  it('keeps a dragged position inside the bounds', () => {
    const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 50 }

    expect(clampPetPosition({ x: -20, y: 80 }, bounds)).toEqual({ x: 0, y: 50 })
    expect(clampPetPosition({ x: 30, y: 20 }, bounds)).toEqual({ x: 30, y: 20 })
  })
})
