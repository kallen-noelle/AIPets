/**
 * Pure physics for a dragged desktop pet window.
 *
 * A host feeds pointer drags and window bounds here, then applies the result to
 * its own window. Nothing in this module reads the DOM, a clock, or a screen.
 */

export interface PetPoint {
  x: number
  y: number
}

/** The area the pet can move in, in the host's own units. */
export interface PetBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface PetPhysicalState {
  position: PetPoint
  velocity: PetPoint
}

export interface PetPhysicsOptions {
  /** Pull toward the anchor, in 1/s². */
  spring: number
  /** Fraction of velocity lost per second, 0..1. */
  friction: number
  /** Fraction of speed kept after a bounds hit, 0..1. */
  restitution: number
  /** Largest step the integrator accepts, in seconds. */
  maxStepSeconds: number
}

export const defaultPetPhysicsOptions: PetPhysicsOptions = {
  spring: 24,
  friction: 8,
  restitution: 0.55,
  maxStepSeconds: 1 / 30,
}

export function createPetPhysicalState(position: PetPoint): PetPhysicalState {
  return { position: { ...position }, velocity: { x: 0, y: 0 } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Limits a flick so one fast gesture cannot throw the pet across the screen. */
export function flingPetPhysicalState(
  state: PetPhysicalState,
  velocity: PetPoint,
  maxSpeed = 2400,
): PetPhysicalState {
  const speed = Math.hypot(velocity.x, velocity.y)
  const scale = speed > maxSpeed ? maxSpeed / speed : 1
  return {
    position: { ...state.position },
    velocity: { x: velocity.x * scale, y: velocity.y * scale },
  }
}

export function clampPetPosition(position: PetPoint, bounds: PetBounds): PetPoint {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  }
}

/**
 * Advances the pet by one step.
 *
 * The pet springs toward `anchor`, loses speed through `friction`, and bounces
 * off `bounds`. A host that drags the pet passes the pointer as the anchor. A
 * host that released the pet passes the resting anchor and keeps the velocity.
 */
export function stepPetPhysics(
  state: PetPhysicalState,
  anchor: PetPoint,
  dtSeconds: number,
  bounds: PetBounds,
  options: PetPhysicsOptions = defaultPetPhysicsOptions,
): PetPhysicalState {
  const dt = clamp(dtSeconds, 0, options.maxStepSeconds)
  if (dt === 0) {
    return { position: { ...state.position }, velocity: { ...state.velocity } }
  }

  const damping = Math.exp(-options.friction * dt)
  let velocityX = (
    state.velocity.x + options.spring * (anchor.x - state.position.x) * dt
  ) * damping
  let velocityY = (
    state.velocity.y + options.spring * (anchor.y - state.position.y) * dt
  ) * damping

  let x = state.position.x + velocityX * dt
  let y = state.position.y + velocityY * dt

  if (x < bounds.minX) {
    x = bounds.minX
    velocityX = Math.abs(velocityX) * options.restitution
  }
  else if (x > bounds.maxX) {
    x = bounds.maxX
    velocityX = -Math.abs(velocityX) * options.restitution
  }

  if (y < bounds.minY) {
    y = bounds.minY
    velocityY = Math.abs(velocityY) * options.restitution
  }
  else if (y > bounds.maxY) {
    y = bounds.maxY
    velocityY = -Math.abs(velocityY) * options.restitution
  }

  return { position: { x, y }, velocity: { x: velocityX, y: velocityY } }
}
