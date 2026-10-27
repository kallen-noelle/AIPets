import { describe, expect, it } from 'vitest'

import { SessionStateMachine } from './session'

function createMachine() {
  let now = 0
  const machine = new SessionStateMachine({
    idleTimeoutMs: 90_000,
    reserveMs: 20_000,
    now: () => now,
  })
  return {
    machine,
    setNow(value: number) {
      now = value
    },
  }
}

describe('sessionStateMachine', () => {
  it('enters a session on click and waits after the entrance finishes', () => {
    const { machine, setNow } = createMachine()
    setNow(1_000)
    const entering = machine.handle({ type: 'click' }, 1_000)
    expect(entering?.from).toBe('ambient')
    expect(entering?.to).toBe('entering')
    expect(entering?.effects).toEqual(['stop-long-action'])
    expect(entering?.epoch).toBe(1)

    const waiting = machine.handle({ type: 'entered' }, 6_000)
    expect(waiting?.to).toBe('waiting')
    expect(waiting?.effects).toEqual(['enter-waiting'])
  })

  it('routes a submit through entering into thinking', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'submit' }, 1_000)
    const thinking = machine.handle({ type: 'entered' }, 2_000)
    expect(thinking?.to).toBe('thinking')
    expect(thinking?.effects).toEqual(['enter-thinking'])
  })

  it('moves waiting to listening and then to thinking', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'click' }, 0)
    machine.handle({ type: 'entered' }, 1_000)

    const listening = machine.handle({ type: 'voice-start' }, 2_000)
    expect(listening?.to).toBe('listening')

    const back = machine.handle({ type: 'voice-end' }, 3_000)
    expect(back?.to).toBe('waiting')

    const thinking = machine.handle({ type: 'submit' }, 4_000)
    expect(thinking?.to).toBe('thinking')
  })

  it('walks thinking to talking to waiting', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'submit' }, 0)
    machine.handle({ type: 'entered' }, 1_000)

    expect(machine.handle({ type: 'reply-start' }, 2_000)?.to).toBe('talking')
    expect(machine.handle({ type: 'reply-end' }, 3_000)?.to).toBe('waiting')
  })

  it('times out ninety seconds after the last interaction', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'submit' }, 1_000)

    expect(machine.handle({ type: 'timeout' }, 1_000 + 89_999)).toBeNull()
    const transition = machine.handle({ type: 'timeout' }, 1_000 + 90_000)
    expect(transition?.to).toBe('ambient')
    expect(transition?.effects).toContain('reorder-plan')
    expect(transition?.effects).toContain('stop-long-action')
  })

  it('keeps the session alive on later interactions', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'submit' }, 0)
    machine.handle({ type: 'entered' }, 1_000)

    const input = machine.handle({ type: 'input' }, 50_000)
    expect(input?.epoch).toBe(2)
    expect(machine.handle({ type: 'timeout' }, 139_999)).toBeNull()
    expect(machine.handle({ type: 'timeout' }, 140_000)?.to).toBe('ambient')
  })

  it('catches up after a long suspension without replaying transitions', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'click' }, 0)
    machine.handle({ type: 'entered' }, 5_000)

    const resumed = machine.resume(600_000)
    expect(resumed?.to).toBe('ambient')
    expect(resumed?.effects).toEqual(['stop-long-action', 'enter-ambient', 'reorder-plan'])
    expect(machine.resume(700_000)).toBeNull()
  })

  it('does not accept a late reply after the session ended', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'submit' }, 0)
    machine.handle({ type: 'entered' }, 1_000)
    machine.handle({ type: 'timeout' }, 100_000)

    expect(machine.handle({ type: 'reply-start' }, 101_000)).toBeNull()
    expect(machine.handle({ type: 'reply-end' }, 102_000)).toBeNull()
  })

  it('reports the sequence budget and remaining time', () => {
    const { machine } = createMachine()
    expect(machine.sequenceBudgetMs()).toBe(70_000)
    expect(machine.remainingMs(0)).toBe(0)

    machine.handle({ type: 'click' }, 10_000)
    expect(machine.remainingMs(40_000)).toBe(60_000)
  })

  it('returns to ambient on reset', () => {
    const { machine } = createMachine()
    machine.handle({ type: 'click' }, 0)
    const reset = machine.handle({ type: 'reset' }, 1_000)
    expect(reset?.to).toBe('ambient')
    expect(machine.snapshot.phase).toBe('ambient')
  })
})
