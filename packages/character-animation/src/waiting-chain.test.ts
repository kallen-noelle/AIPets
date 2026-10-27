import type { AnimationCommand } from './types'

import { describe, expect, it } from 'vitest'

import { parseAnimationManifest } from './manifest'
import { AnimationController } from './state'

function clipIdOf(commands: AnimationCommand[]): string | undefined {
  const first = commands[0]
  return first?.type === 'play' ? first.clip.id : undefined
}

function createFakeClock() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number, callback: () => void }>()

  return {
    clock: {
      now: () => now,
      setTimer: (delayMs: number, callback: () => void) => {
        const id = nextId++
        timers.set(id, { at: now + delayMs, callback })
        return () => timers.delete(id)
      },
    },
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
      }
    },
  }
}

function createController(withWaiting = true) {
  const fake = createFakeClock()
  const emitted: AnimationCommand[][] = []
  const result = parseAnimationManifest({
    manifestVersion: 1,
    id: 'test-pet',
    name: 'Test Pet',
    canvas: { width: 1280, height: 720 },
    animations: {
      idle: ['idle/a.webm'],
      talk: ['talk/a.webm'],
      ...(withWaiting ? { waiting: ['waiting/a.webm'] } : {}),
      longActions: {
        swing: {
          start: 'long/swing-start.webm',
          mid: { src: 'long/swing-mid.webm', durationMs: 4000 },
          end: 'long/swing-end.webm',
        },
      },
    },
  })
  if (!result.ok)
    throw new Error(result.issues.join(', '))

  const controller = new AnimationController(result.pack, {
    random: () => 0,
    clock: fake.clock,
    onCommands: commands => emitted.push(commands),
  })

  return { controller, emitted, advance: fake.advance, pack: result.pack }
}

describe('waiting chain', () => {
  it('falls back to idle when the manifest has no waiting clips', () => {
    const { pack } = createController(false)
    expect(pack.chains.waiting.map(clip => clip.id)).toEqual(['idle/a.webm'])
  })

  it('enters and leaves the waiting chain', () => {
    const { controller } = createController()
    controller.dispatch({ type: 'idle' })

    expect(clipIdOf(controller.dispatch({ type: 'waiting', value: true }))).toBe('waiting/a.webm')
    expect(controller.snapshot.waiting).toBe(true)

    expect(clipIdOf(controller.dispatch({ type: 'waiting', value: false }))).toBe('idle/a.webm')
    expect(controller.snapshot.waiting).toBe(false)
  })

  it('returns to waiting after speech ends', () => {
    const { controller } = createController()
    controller.dispatch({ type: 'waiting', value: true })
    controller.dispatch({ type: 'speaking', value: true })

    expect(clipIdOf(controller.dispatch({ type: 'speaking', value: false }))).toBe('waiting/a.webm')
  })

  it('plays the long action exit clip before the wait chain starts', () => {
    const { controller, advance } = createController()
    controller.dispatch({ type: 'idle' })
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    expect(clipIdOf(controller.dispatch({ type: 'longActionStop', mode: 'end' }))).toBe('long/swing-end.webm')
    // The wait request must not cut the exit clip.
    expect(controller.dispatch({ type: 'waiting', value: true })).toEqual([])
    expect(controller.snapshot.waiting).toBe(true)

    expect(clipIdOf(controller.clipEnded('long/swing-end.webm'))).toBe('waiting/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
    advance(60000)
  })

  it('clears the waiting flag on an idle request', () => {
    const { controller } = createController()
    controller.dispatch({ type: 'waiting', value: true })
    controller.dispatch({ type: 'idle' })

    expect(controller.snapshot.waiting).toBe(false)
    expect(controller.snapshot.base).toBe('idle')
  })
})
