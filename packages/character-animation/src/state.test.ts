import { describe, expect, it } from 'vitest'

import { parseAnimationManifest } from './manifest'
import { AnimationController } from './state'

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
