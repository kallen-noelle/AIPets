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
      actions: {
        wave: 'action/wave.webm',
      },
      emotion: {
        happy: ['emotion/happy.webm'],
      },
    },
  })
  if (!result.ok)
    throw new Error(result.issues.join(', '))

  return new AnimationController(result.pack, { random: () => 0 })
}

describe('animationController explicit clips', () => {
  it('plays an exact clip id', () => {
    const controller = createController()
    const commands = controller.dispatch({ type: 'playClip', clipId: 'action/wave.webm' })

    expect(commands[0]?.type).toBe('play')
    if (commands[0]?.type !== 'play')
      return
    expect(commands[0].clip.id).toBe('action/wave.webm')
    expect(commands[0].clip.loop).toBe(false)
  })

  it('returns to the base chain after an explicit one-shot', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })
    controller.dispatch({ type: 'playClip', clipId: 'action/wave.webm' })

    const commands = controller.clipEnded('action/wave.webm')
    expect(commands[0]?.type).toBe('play')
    if (commands[0]?.type !== 'play')
      return
    expect(commands[0].clip.id).toBe('idle/b.webm')
  })

  it('loops a temporary state and returns to it after a one-shot', () => {
    const controller = createController()
    const state = controller.dispatch({ type: 'setState', clipId: 'idle/b.webm' })

    expect(state[0]?.type).toBe('play')
    if (state[0]?.type !== 'play')
      return
    expect(state[0].clip.id).toBe('idle/b.webm')
    expect(state[0].clip.loop).toBe(true)
    expect(controller.snapshot.stateClipId).toBe('idle/b.webm')

    controller.dispatch({ type: 'playClip', clipId: 'action/wave.webm' })
    const recovered = controller.clipEnded('action/wave.webm')
    expect(recovered[0]?.type).toBe('play')
    if (recovered[0]?.type !== 'play')
      return
    expect(recovered[0].clip.id).toBe('idle/b.webm')
  })

  it('returns to the temporary state after speaking ends', () => {
    const controller = createController()
    controller.dispatch({ type: 'setState', clipId: 'idle/b.webm' })

    const talk = controller.dispatch({ type: 'speaking', value: true })
    expect(talk[0]?.type).toBe('play')
    if (talk[0]?.type !== 'play')
      return
    expect(talk[0].clip.id).toBe('talk/a.webm')

    const idle = controller.dispatch({ type: 'speaking', value: false })
    expect(idle[0]?.type).toBe('play')
    if (idle[0]?.type !== 'play')
      return
    expect(idle[0].clip.id).toBe('idle/b.webm')
  })

  it('clears the temporary state and returns to the idle chain', () => {
    const controller = createController()
    controller.dispatch({ type: 'idle' })
    controller.dispatch({ type: 'setState', clipId: 'idle/b.webm' })

    const commands = controller.dispatch({ type: 'clearState' })
    expect(commands[0]?.type).toBe('play')
    if (commands[0]?.type !== 'play')
      return
    expect(commands[0].clip.id).toBe('idle/a.webm')
    expect(controller.snapshot.stateClipId).toBeNull()
  })

  it('ignores an unknown clip id', () => {
    const controller = createController()
    expect(controller.dispatch({ type: 'playClip', clipId: 'missing.webm' })).toEqual([])
    expect(controller.dispatch({ type: 'setState', clipId: 'missing.webm' })).toEqual([])
  })
})
