import type { AnimationCommand } from './types'

import { describe, expect, it } from 'vitest'

import { parseAnimationManifest } from './manifest'
import { AnimationController } from './state'

function clipIdOf(commands: AnimationCommand[]): string | undefined {
  const first = commands[0]
  return first?.type === 'play' ? first.clip.id : undefined
}

function createController() {
  const result = parseAnimationManifest({
    manifestVersion: 1,
    id: 'test-pet',
    name: 'Test Pet',
    canvas: { width: 1280, height: 720 },
    animations: {
      idle: ['idle/a.webm', 'idle/b.webm'],
      talk: ['talk/a.webm'],
      thinking: ['thinking/a.webm'],
      emotion: {
        happy: {
          low: ['emotion/happy-low.webm'],
          high: ['emotion/happy-high.webm'],
        },
      },
      actions: { wave: 'action/wave.webm' },
      click: { head: ['click/head.webm'], body: ['click/body.webm'] },
    },
  })
  if (!result.ok)
    throw new Error(result.issues.join(', '))

  return new AnimationController(result.pack, { random: () => 0 })
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
    pending: () => timers.size,
  }
}

function createLongActionController() {
  const fake = createFakeClock()
  const emitted: AnimationCommand[][] = []
  const result = parseAnimationManifest({
    manifestVersion: 1,
    id: 'test-pet',
    name: 'Test Pet',
    canvas: { width: 1280, height: 720 },
    animations: {
      idle: ['idle/a.webm'],
      longActions: {
        swing: {
          start: 'long/swing-start.webm',
          mid: { src: 'long/swing-mid.webm', durationMs: 4000 },
          end: 'long/swing-end.webm',
        },
        sway: {
          mid: { src: 'long/sway-mid.webm', durationMs: 3000 },
          defaultDurationMs: 6000,
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

  return { controller, emitted, advance: fake.advance, pending: fake.pending }
}

describe('animationController', () => {
  it('starts idle and advances the idle chain', () => {
    const controller = createController()
    const first = controller.dispatch({ type: 'idle' })
    expect(first[0]?.type).toBe('play')
    if (first[0]?.type !== 'play')
      return
    expect(first[0].clip.id).toBe('idle/a.webm')

    const second = controller.clipEnded('idle/a.webm')
    expect(second[0]?.type).toBe('play')
    if (second[0]?.type !== 'play')
      return
    expect(second[0].clip.id).toBe('idle/b.webm')
  })

  it('selects the high emotion tier above the threshold', () => {
    const controller = createController()
    const commands = controller.dispatch({ type: 'emotion', emotion: 'happy', intensity: 0.9 })
    expect(commands[0]?.type).toBe('play')
    if (commands[0]?.type !== 'play')
      return
    expect(commands[0].clip.id).toBe('emotion/happy-high.webm')
  })

  it('returns to the base chain after a one-shot clip ends', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })
    controller.dispatch({ type: 'emotion', emotion: 'happy', intensity: 0.2 })

    const commands = controller.clipEnded('emotion/happy-low.webm')
    expect(commands[0]?.type).toBe('play')
    if (commands[0]?.type !== 'play')
      return
    expect(commands[0].clip.id).toBe('idle/b.webm')
  })

  it('switches to talk when speaking starts and ignores thinking', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })

    const talk = controller.dispatch({ type: 'speaking', value: true })
    expect(talk[0]?.type).toBe('play')
    if (talk[0]?.type !== 'play')
      return
    expect(talk[0].clip.id).toBe('talk/a.webm')

    expect(controller.dispatch({ type: 'thinking', value: true })).toEqual([])
  })

  it('pauses and resumes without replaying', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })

    expect(controller.dispatch({ type: 'paused', value: true })).toEqual([{ type: 'pause' }])
    expect(controller.dispatch({ type: 'paused', value: false })).toEqual([{ type: 'resume' }])
  })

  it('picks click clips by area', () => {
    const controller = createController()
    const commands = controller.dispatch({ type: 'click', area: 'head' })
    expect(commands[0]?.type).toBe('play')
    if (commands[0]?.type !== 'play')
      return
    expect(commands[0].clip.id).toBe('click/head.webm')
  })
})

describe('long actions', () => {
  it('plays start, loops mid, and inserts end when the timer expires', () => {
    const { controller, emitted, advance } = createLongActionController()
    const started = controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    expect(clipIdOf(started)).toBe('long/swing-start.webm')
    expect(controller.snapshot.longActionPhase).toBe('start')

    const firstMid = controller.clipEnded('long/swing-start.webm')
    expect(clipIdOf(firstMid)).toBe('long/swing-mid.webm')
    expect(controller.snapshot.longActionPhase).toBe('mid')

    // Mid clips loop by themselves until the timer fires.
    expect(clipIdOf(controller.clipEnded('long/swing-mid.webm'))).toBe('long/swing-mid.webm')
    advance(39999)
    expect(emitted).toHaveLength(0)

    advance(1)
    expect(clipIdOf(emitted[0] ?? [])).toBe('long/swing-end.webm')
    expect(controller.snapshot.longActionPhase).toBe('end')

    const finished = controller.clipEnded('long/swing-end.webm')
    expect(clipIdOf(finished)).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('cuts a mid clip even when it outlasts the requested duration', () => {
    const { controller, emitted, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 9000 })
    controller.clipEnded('long/swing-start.webm')

    advance(9000)
    expect(clipIdOf(emitted[0] ?? [])).toBe('long/swing-end.webm')
  })

  it('uses the declared default duration when the caller passes none', () => {
    const { controller, emitted, advance } = createLongActionController()
    const started = controller.dispatch({ type: 'action', name: 'sway' })
    expect(clipIdOf(started)).toBe('long/sway-mid.webm')

    advance(6000)
    // No end clip, so the timer returns to the base chain.
    expect(clipIdOf(emitted[0] ?? [])).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('clears the timer when speech interrupts the long action', () => {
    const { controller, emitted, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    controller.dispatch({ type: 'speaking', value: true })
    expect(controller.snapshot.longActionName).toBeNull()

    advance(60000)
    expect(emitted).toHaveLength(0)
    expect(controller.clipEnded('long/swing-mid.webm')).toEqual([])
  })

  it('freezes the budget while paused and resumes the rest', () => {
    const { controller, emitted, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    advance(10000)
    controller.dispatch({ type: 'paused', value: true })
    advance(100000)
    expect(emitted).toHaveLength(0)

    controller.dispatch({ type: 'paused', value: false })
    advance(29999)
    expect(emitted).toHaveLength(0)
    advance(1)
    expect(clipIdOf(emitted[0] ?? [])).toBe('long/swing-end.webm')
  })

  it('stops on request with the end clip or with a cut', () => {
    const endRun = createLongActionController()
    endRun.controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    endRun.controller.clipEnded('long/swing-start.webm')
    expect(clipIdOf(endRun.controller.dispatch({ type: 'longActionStop' }))).toBe('long/swing-end.webm')
    endRun.advance(60000)
    expect(endRun.emitted).toHaveLength(0)

    const cutRun = createLongActionController()
    cutRun.controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    cutRun.controller.clipEnded('long/swing-start.webm')
    expect(clipIdOf(cutRun.controller.dispatch({ type: 'longActionStop', mode: 'cut' }))).toBe('idle/a.webm')
    cutRun.advance(60000)
    expect(cutRun.emitted).toHaveLength(0)
  })

  it('clears the timer when another action replaces the long action', () => {
    const { controller, emitted, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    controller.dispatch({ type: 'action', name: 'sway' })
    controller.dispatch({ type: 'longActionStop', mode: 'cut' })
    advance(60000)
    expect(emitted).toHaveLength(0)
  })

  it('drops pending timers on dispose', () => {
    const { controller, emitted, advance, pending } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')
    expect(pending()).toBe(1)

    controller.dispose()
    advance(60000)
    expect(emitted).toHaveLength(0)
  })

  it('falls back to a one-shot for normal actions', () => {
    const controller = createController()
    const commands = controller.dispatch({ type: 'action', name: 'wave' })
    expect(clipIdOf(commands)).toBe('action/wave.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })
})
