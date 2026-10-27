import type { PerformanceCue } from './plan'

import { comparePlanAnchors } from './plan'

export interface PlanTimelineMark {
  type: 'reply-start' | 'sentence' | 'speech-end'
  /** Only present on sentence marks. */
  index?: number
  at: number
}

export type PlanArrivalDropReason
  = | 'late-anchor'
    | 'superseded-late'
    | 'too-long'
    | 'long-action-in-speech'

export interface PlanArrivalDrop {
  clipId: string
  reason: PlanArrivalDropReason
}

export interface TimedPlanCue {
  cue: PerformanceCue
  /** Delay from the plan arrival. */
  inMs: number
}

export interface PlanArrivalDecision {
  /** Play at once, in anchor order. */
  playNow: PerformanceCue[]
  /** Short delays owned by the host, such as a silence after speech. */
  timed: TimedPlanCue[]
  /** Anchors that are still in the future. Feed them to the executor. */
  scheduled: PerformanceCue[]
  dropped: PlanArrivalDrop[]
}

export interface PlanArrivalOptions {
  cues: PerformanceCue[]
  marks: PlanTimelineMark[]
  /** Time the plan reached the stage. */
  now: number
  /** Anchors older than this are dropped. */
  lateToleranceMs?: number
  /** A sentence-boundary insert must fit this length. */
  maxInsertDurationMs?: number
  /** Known clip lengths, keyed by clip id. */
  clipDurations?: Record<string, number>
}

function findMark(marks: PlanTimelineMark[], type: PlanTimelineMark['type'], index?: number): PlanTimelineMark | undefined {
  return marks.find(mark => mark.type === type && (index === undefined || mark.index === index))
}

interface LateCue {
  cue: PerformanceCue
  markAt: number
}

/**
 * Resolves a plan that arrived after the reply started.
 *
 * The director runs after the reply is complete, so reply and sentence anchors
 * are usually already in the past. A cue that is at most `lateToleranceMs` late
 * still plays. After that, only the newest of the late cues survives and the
 * rest are dropped, which prevents a burst of catch-up animations.
 *
 * `afterSpeech` and silent filler cues are never dropped.
 */
export function resolvePlanArrival(options: PlanArrivalOptions): PlanArrivalDecision {
  const lateTolerance = options.lateToleranceMs ?? 2_000
  const maxInsert = options.maxInsertDurationMs ?? 2_000
  const marks = options.marks
  const playNow: PerformanceCue[] = []
  const timed: TimedPlanCue[] = []
  const scheduled: PerformanceCue[] = []
  const dropped: PlanArrivalDrop[] = []
  const late: LateCue[] = []

  for (const cue of options.cues) {
    const anchor = cue.anchor

    if (cue.durationSeconds !== undefined && (anchor.type === 'replyStart' || anchor.type === 'sentence')) {
      dropped.push({ clipId: cue.clipId, reason: 'long-action-in-speech' })
      continue
    }

    if (anchor.type === 'replyStart' || anchor.type === 'sentence') {
      const known = options.clipDurations?.[cue.clipId]
      if (known !== undefined && known > maxInsert) {
        dropped.push({ clipId: cue.clipId, reason: 'too-long' })
        continue
      }
    }

    if (anchor.type === 'afterSpeech') {
      const end = findMark(marks, 'speech-end')
      if (!end) {
        scheduled.push(cue)
        continue
      }

      playNow.push(cue)
      continue
    }

    if (anchor.type === 'silence') {
      const end = findMark(marks, 'speech-end')
      if (!end) {
        scheduled.push(cue)
        continue
      }

      const target = end.at + anchor.seconds * 1000
      if (target <= options.now)
        playNow.push(cue)
      else
        timed.push({ cue, inMs: target - options.now })
      continue
    }

    const mark = anchor.type === 'replyStart'
      ? findMark(marks, 'reply-start')
      : findMark(marks, 'sentence', anchor.index)

    if (!mark || mark.at > options.now) {
      scheduled.push(cue)
      continue
    }

    const delay = options.now - mark.at
    if (delay <= lateTolerance)
      playNow.push(cue)
    else
      late.push({ cue, markAt: mark.at })
  }

  if (late.length === 1) {
    dropped.push({ clipId: late[0].cue.clipId, reason: 'late-anchor' })
  }
  else if (late.length > 1) {
    let newest = late[0]
    for (const item of late.slice(1)) {
      if (item.markAt >= newest.markAt)
        newest = item
    }

    playNow.push(newest.cue)
    for (const item of late) {
      if (item !== newest)
        dropped.push({ clipId: item.cue.clipId, reason: 'superseded-late' })
    }
  }

  playNow.sort((left, right) => comparePlanAnchors(left.anchor, right.anchor))
  scheduled.sort((left, right) => comparePlanAnchors(left.anchor, right.anchor))

  return { playNow, timed, scheduled, dropped }
}
