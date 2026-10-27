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
          loop: { src: 'long/swing-loop.webm', durationMs: 4000 },
          end: 'long/swing-end.webm',
        },
        sway: {
          loop: { src: 'long/sway-loop.webm', durationMs: 3000 },
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
  })

  return { controller, advance: fake.advance, pending: fake.pending }
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

  it('finishes a one-shot clip before a new request replaces it', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })
    controller.dispatch({ type: 'emotion', emotion: 'happy', intensity: 0.2 })

    expect(controller.dispatch({ type: 'click', area: 'head' })).toEqual([])
    expect(controller.snapshot.currentClipId).toBe('emotion/happy-low.webm')

    expect(clipIdOf(controller.clipEnded('emotion/happy-low.webm'))).toBe('click/head.webm')
  })

  it('finishes a one-shot clip before speech starts', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })
    controller.dispatch({ type: 'emotion', emotion: 'happy', intensity: 0.2 })

    expect(controller.dispatch({ type: 'speaking', value: true })).toEqual([])
    expect(controller.snapshot.currentClipId).toBe('emotion/happy-low.webm')

    expect(clipIdOf(controller.clipEnded('emotion/happy-low.webm'))).toBe('talk/a.webm')
  })
})

describe('long actions', () => {
  it('plays start, loops the loop clip, and inserts end after the budget ends', () => {
    const { controller, advance } = createLongActionController()
    const started = controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    expect(clipIdOf(started)).toBe('long/swing-start.webm')
    expect(controller.snapshot.longActionPhase).toBe('start')

    const firstLoop = controller.clipEnded('long/swing-start.webm')
    expect(clipIdOf(firstLoop)).toBe('long/swing-loop.webm')
    expect(controller.snapshot.longActionPhase).toBe('loop')

    // The loop clip repeats until the budget is spent.
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-loop.webm')
    advance(39999)
    expect(controller.snapshot.longActionPhase).toBe('loop')

    // The budget never cuts the running clip. The exit waits for its end.
    advance(1)
    expect(controller.snapshot.longActionPhase).toBe('loop')
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')
    expect(controller.snapshot.longActionPhase).toBe('end')

    const finished = controller.clipEnded('long/swing-end.webm')
    expect(clipIdOf(finished)).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('counts the start clip against the budget', () => {
    const { controller, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 9000 })

    // Six of the nine seconds go to the start clip.
    advance(6000)
    expect(clipIdOf(controller.clipEnded('long/swing-start.webm'))).toBe('long/swing-loop.webm')

    advance(2999)
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-loop.webm')

    advance(1)
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')
  })

  it('waits for the loop clip when the budget ends before the clip does', () => {
    const { controller, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 9000 })
    controller.clipEnded('long/swing-start.webm')

    advance(9000)
    expect(controller.snapshot.longActionPhase).toBe('loop')
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')
  })

  it('replays the loop clip without a fade', () => {
    const { controller } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })

    const entered = controller.clipEnded('long/swing-start.webm')
    expect(entered[0]?.type).toBe('play')
    if (entered[0]?.type !== 'play')
      return
    expect(entered[0].fadeMs).toBe(180)

    const replay = controller.clipEnded('long/swing-loop.webm')
    expect(replay[0]?.type).toBe('play')
    if (replay[0]?.type !== 'play')
      return
    expect(replay[0].fadeMs).toBe(0)
  })

  it('uses the declared default duration when the caller passes none', () => {
    const { controller, advance } = createLongActionController()
    const started = controller.dispatch({ type: 'action', name: 'sway' })
    expect(clipIdOf(started)).toBe('long/sway-loop.webm')

    advance(6000)
    // No end clip, so the base chain returns after the loop clip ends.
    expect(clipIdOf(controller.clipEnded('long/sway-loop.webm'))).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('finishes the running loop before the exit clip when speech starts', () => {
    const { controller, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    expect(controller.dispatch({ type: 'speaking', value: true })).toEqual([])
    expect(controller.snapshot.longActionName).toBe('swing')
    expect(controller.snapshot.longActionPhase).toBe('loop')

    // The running loop clip is not abandoned.
    advance(60000)
    expect(controller.snapshot.longActionPhase).toBe('loop')
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')

    expect(clipIdOf(controller.clipEnded('long/swing-end.webm'))).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('finishes the start clip before the exit clip when interrupted', () => {
    const { controller } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })

    expect(controller.dispatch({ type: 'speaking', value: true })).toEqual([])
    expect(controller.snapshot.longActionPhase).toBe('start')

    expect(clipIdOf(controller.clipEnded('long/swing-start.webm'))).toBe('long/swing-end.webm')
    expect(controller.snapshot.longActionPhase).toBe('end')
  })

  it('freezes the budget while paused and resumes the rest', () => {
    const { controller, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    advance(10000)
    controller.dispatch({ type: 'paused', value: true })
    advance(100000)
    expect(controller.snapshot.longActionPhase).toBe('loop')

    controller.dispatch({ type: 'paused', value: false })
    advance(29999)
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-loop.webm')

    advance(1)
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')
  })

  it('waits for the running loop before the exit clip on an explicit stop', () => {
    const { controller } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    expect(controller.dispatch({ type: 'longActionStop' })).toEqual([])
    expect(controller.snapshot.longActionPhase).toBe('loop')

    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')
    expect(clipIdOf(controller.clipEnded('long/swing-end.webm'))).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('runs the pending action after the exit clip', () => {
    const { controller, advance } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')

    expect(controller.dispatch({ type: 'action', name: 'sway' })).toEqual([])
    expect(controller.snapshot.longActionName).toBe('swing')

    // The running loop finishes, then the swing exit clip, then sway starts.
    expect(clipIdOf(controller.clipEnded('long/swing-loop.webm'))).toBe('long/swing-end.webm')
    expect(clipIdOf(controller.clipEnded('long/swing-end.webm'))).toBe('long/sway-loop.webm')
    expect(controller.snapshot.longActionName).toBe('sway')
    expect(controller.snapshot.longActionPhase).toBe('loop')

    advance(6000)
    expect(clipIdOf(controller.clipEnded('long/sway-loop.webm'))).toBe('idle/a.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('drops pending timers on dispose', () => {
    const { controller, pending } = createLongActionController()
    controller.dispatch({ type: 'action', name: 'swing', durationMs: 40000 })
    controller.clipEnded('long/swing-start.webm')
    expect(pending()).toBe(1)

    controller.dispose()
    expect(pending()).toBe(0)
    expect(controller.snapshot.longActionName).toBeNull()
  })

  it('falls back to a one-shot for normal actions', () => {
    const controller = createController()
    const commands = controller.dispatch({ type: 'action', name: 'wave' })
    expect(clipIdOf(commands)).toBe('action/wave.webm')
    expect(controller.snapshot.longActionName).toBeNull()
  })
})
