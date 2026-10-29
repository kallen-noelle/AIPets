import type {
  ActionSequence,
  AffectState,
  CharacterCatalog,
  ClipDescriptor,
  LongActionClips,
  PerformancePlan,
  SequenceStep,
} from '@proj-aipets/character-animation'

import {
  sequenceStepDurationMs,
  truncateSequenceToBudget,
  validateActionSequence,
  validatePerformancePlan,
} from '@proj-aipets/character-animation'

import { requestChatCompletion } from '../chat/client'
import { animationLog } from './animation-log'
import { directorMonitor } from './director-monitor'
import { buildStatePrompt } from './state-context'

export interface DirectorHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

/** One long action the director can schedule in the idle sequence. */
export interface DirectorLongAction {
  id: string
  /** Start clip length. Zero when the action has no start clip. */
  startMs: number
  /** Loop clip id. Used as the held loop of one ambient phase. */
  loopClipId: string
  /** One loop clip length. */
  loopMs: number
  /** End clip length. Zero when the action has no end clip. */
  endMs: number
  /** Loop budget used when the caller omits one. */
  defaultMs: number
}

export interface DirectorRequest {
  baseUrl: string
  apiKey: string
  model: string
  characterName: string
  persona: string
  affect: AffectState
  catalog: CharacterCatalog
  history: DirectorHistoryTurn[]
  replyText: string
  /** Long-term memory text the chat turn already uses. */
  memory?: string
  /** Clips the character just played, newest first. */
  recentClipIds?: string[]
  longActions?: DirectorLongAction[]
  timeoutMs?: number
}

export interface DirectorResult {
  plan: PerformancePlan
  /** Waiting-phase steps. Null when the model returned none or they failed validation. */
  sequence: ActionSequence | null
  candidates: ClipDescriptor[]
}

/** Flattens the pack long actions into the shape the prompt needs. */
export function describeLongActions(longActions: Record<string, LongActionClips>): DirectorLongAction[] {
  return Object.entries(longActions).map(([id, entry]) => ({
    id,
    startMs: entry.start?.durationMs ?? 0,
    loopClipId: entry.loop.id,
    loopMs: entry.loop.durationMs ?? 0,
    endMs: entry.end?.durationMs ?? 0,
    defaultMs: entry.defaultDurationMs ?? 0,
  }))
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start)
    return null

  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  }
  catch {
    return null
  }
}

const idleSequenceBudgetMs = 70_000

/** Long action ids that appear in the latest user message. */
function namedLongActionIds(request: DirectorRequest): string[] {
  let text = ''
  for (let index = request.history.length - 1; index >= 0; index -= 1) {
    const turn = request.history[index]
    if (turn?.role === 'user') {
      text = turn.content
      break
    }
  }

  if (!text)
    return []

  return (request.longActions ?? [])
    .map(action => action.id)
    .filter(id => text.includes(id))
}

/**
 * Keeps one name in exactly one action list.
 *
 * A long action id and a short clip name can collide. When both appear, the
 * model picks the short clip for a named long action.
 */
function splitActionCandidates(
  clips: ClipDescriptor[],
  longActions: DirectorLongAction[],
): { longActionIds: string[], shortClips: ClipDescriptor[] } {
  const longActionIds = longActions.map(action => action.id)
  const longActionSet = new Set(longActionIds)

  return {
    longActionIds,
    shortClips: clips.filter(clip => !longActionSet.has(clip.name) && !longActionSet.has(clip.id)),
  }
}

function buildRules(): string[] {
  return [
    '- 先检查用户信息：出现长动作列表里的名称时，idle.steps 必须包含该名称的 long 步骤，durationMs 约 30000。',
    '- kind 为 long 时，actionId 只能取长动作列表里的名称，durationMs 在 5000 到 60000。',
    '- affect.valence 在 -0.10 到 0.10，affect.arousal 在 -0.08 到 0.08。',
    '- affect 必须有非零增量：valence 与 arousal 至少一个不为 0。',
    '- cues 必须至少 1 条。数量按本轮情境决定，不要凑数。',
    '- anchor 只能是 {"type":"replyStart"}、{"type":"sentence","index":1}、{"type":"afterSpeech"} 或 {"type":"silence","seconds":5}。',
    '- cues.clipId 只能取短动作列表里的名称。',
    '- 同一个 clipId 不要重复。',
    '- idle.steps 最多 6 步，总时长不超过 70 秒。',
    '- kind 为 short 时，actionId 只能取短动作列表里的名称，durationMs 在 1000 到 10000。',
    '- 必须从短动作列表里选出至少 1 个最贴合本轮语气与情绪的片段，禁止输出空 cues。',
  ]
}

function buildPlanSections(
  request: DirectorRequest,
  shortClips: ClipDescriptor[],
  longActionIds: string[],
): string[] {
  // Action names only. The pack file paths never reach the prompt.
  const animations = {
    'long-action': longActionIds,
    'short-action': shortClips.map(clip => clip.name),
  }

  return [
    buildStatePrompt({
      affect: request.affect,
      recentClipIds: request.recentClipIds ?? [],
      now: new Date(),
    }),
    '',
    `动作：${JSON.stringify(animations)}`,
    '',
    '规则：',
    ...buildRules(),
  ]
}

function buildSystemPrompt(
  request: DirectorRequest,
  shortClips: ClipDescriptor[],
  longActionIds: string[],
): string {
  const history = request.history
    .slice(-4)
    .map(turn => `${turn.role}: ${truncate(turn.content, 200)}`)
    .join('\n')

  return [
    `你是「${request.characterName}」。你只负责为这一轮回复编排角色动作。`,
    '只输出一个 JSON 对象，不要 Markdown，不要解释。',
    '',
    '人设：',
    request.persona || '(none)',
    '',
    '记忆：',
    `用户记忆：${truncate(request.memory ?? '', 1200) || '(none)'}`,
    '对话历史：',
    history || '(none)',
    '',
    ...buildPlanSections(request, shortClips, longActionIds),
    '',
    '回复例子：',
    '例 1，用户信息「吹笛子给我看吧」：',
    '{"affect":{"valence":0.06,"arousal":0.05},"cues":[{"anchor":{"type":"replyStart"},"clipId":"待机呼吸休闲","intensity":0.7}],"idle":{"steps":[{"kind":"long","actionId":"吹笛子","durationMs":30000}]}}',
    '例 2，用户信息「今天有点累」：',
    '{"affect":{"valence":-0.04,"arousal":-0.06},"cues":[{"anchor":{"type":"sentence","index":1},"clipId":"哈欠连天","intensity":0.6}],"idle":{"steps":[{"kind":"short","actionId":"东张西望","durationMs":5000}]}}',
    '例子只示范格式，片段必须按当前情境重新选择。',
  ].join('\n')
}

/**
 * The plan section the chat prompt appends when the same call produces both the
 * reply and the plan. Persona, memory, and history already sit in the chat
 * prompt, so this section only carries state, candidates, rules, and format.
 */
export function buildInlinePlanInstructions(request: DirectorRequest): string {
  const { longActionIds, shortClips } = splitActionCandidates(request.catalog.clips, request.longActions ?? [])
  if (!shortClips.length)
    return ''

  return [
    '动作编排：',
    '回复正文写完后，必须另起一行输出动画计划，cues 不得为空。计划只写一次，不要在正文里提到它。',
    '',
    ...buildPlanSections(request, shortClips, longActionIds),
    '',
    '格式：',
    '<<<PLAN',
    '{"affect":{"valence":0.06,"arousal":0.05},"cues":[{"anchor":{"type":"replyStart"},"clipId":"东张西望","intensity":0.7}],"idle":{"steps":[{"kind":"short","actionId":"哈欠连天","durationMs":5000}]}}',
    'PLAN>>>',
    '用户点名长动作时，把 idle.steps 写成 [{"kind":"long","actionId":"该动作名","durationMs":30000}]。',
    '例子只示范格式，片段必须按当前情境重新选择。',
  ].join('\n')
}

/** Splits the inline plan block out of a chat reply. */
export function splitInlinePlan(text: string): { replyText: string, planText: string } {
  const marker = '<<<PLAN'
  const at = text.indexOf(marker)
  if (at < 0)
    return { replyText: text.trim(), planText: '' }

  const rest = text.slice(at + marker.length)
  const end = rest.indexOf('PLAN>>>')
  const body = (end >= 0 ? rest.slice(0, end) : rest)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = body.indexOf('{')
  const last = body.lastIndexOf('}')

  return {
    replyText: text.slice(0, at).trim(),
    planText: start >= 0 && last > start ? body.slice(start, last + 1) : '',
  }
}

function buildUserPrompt(request: DirectorRequest): string {
  let lastUserMessage = ''
  for (let index = request.history.length - 1; index >= 0; index -= 1) {
    const turn = request.history[index]
    if (turn?.role === 'user') {
      lastUserMessage = turn.content
      break
    }
  }

  const named = namedLongActionIds(request)

  return [
    '用户信息：',
    truncate(lastUserMessage, 400) || '(none)',
    named.length ? `用户点名的长动作：${JSON.stringify(named)}` : '',
    '',
    '本轮角色回复：',
    truncate(request.replyText, 400),
  ].filter(Boolean).join('\n')
}

/**
 * Maps the clip names the prompt shows back to their pack ids.
 *
 * The prompt lists names so the model never sees a file path. Validation and
 * the executor need ids, so every accepted name is swapped back before the plan
 * reaches the stage. The first clip wins when two clips share a name.
 */
function createNameIndex(clips: ClipDescriptor[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const clip of clips) {
    if (!index.has(clip.name))
      index.set(clip.name, clip.id)
  }
  return index
}

function resolveIdleSequence(
  input: unknown,
  request: DirectorRequest,
  candidates: ClipDescriptor[],
  nameIndex: Map<string, string>,
): ActionSequence | null {
  if (typeof input !== 'object' || input === null)
    return null

  const validation = validateActionSequence(input, {
    clipIds: candidates.map(clip => clip.name),
    longActionIds: (request.longActions ?? []).map(action => action.id),
    maxSteps: 6,
  })

  if (!validation.ok || !validation.sequence) {
    animationLog.write('director', 'idle sequence dropped: invalid', { issues: validation.issues })
    return null
  }

  const budget = truncateSequenceToBudget(validation.sequence, idleSequenceBudgetMs)
  if (!budget.sequence.steps.length) {
    animationLog.write('director', 'idle sequence dropped: over budget', {
      issues: validation.issues,
      dropped: budget.dropped.map(step => step.actionId),
    })
    return null
  }

  const sequence: ActionSequence = {
    ...budget.sequence,
    steps: budget.sequence.steps.map((step): SequenceStep => {
      if (step.kind !== 'short')
        return step

      const clipId = nameIndex.get(step.actionId)
      return clipId ? { ...step, actionId: clipId } : step
    }),
  }

  animationLog.write('director', 'idle sequence accepted', {
    steps: sequence.steps.map(step => ({
      kind: step.kind,
      actionId: step.actionId,
      durationMs: sequenceStepDurationMs(step),
    })),
    totalMs: budget.totalMs,
    truncated: budget.truncated,
    issues: validation.issues,
  })
  return sequence
}

/**
 * Validates one parsed plan and resolves its idle sequence.
 *
 * A schema error, an empty plan, or a sequence that fails validation drops the
 * plan. The chat flow keeps running either way.
 */
function acceptPlan(
  input: Record<string, unknown>,
  request: DirectorRequest,
  candidates: ClipDescriptor[],
  longActionIds: string[],
): DirectorResult | null {
  const nameIndex = createNameIndex(candidates)
  // Validate against a catalog whose ids are the names the prompt showed, so a
  // plan written in names passes. The real ids are restored right after.
  const nameCatalog: CharacterCatalog = {
    ...request.catalog,
    clips: candidates.map(clip => ({ ...clip, id: clip.name })),
  }

  const validation = validatePerformancePlan(input, {
    catalog: nameCatalog,
    longActionIds,
    maxCues: Number.POSITIVE_INFINITY,
  })
  if (!validation.ok || !validation.plan) {
    animationLog.write('director', 'abort: validation failed', { issues: validation.issues })
    return null
  }

  let plan = validation.plan

  plan = {
    ...plan,
    cues: plan.cues.map(cue => ({
      ...cue,
      clipId: nameIndex.get(cue.clipId) ?? cue.clipId,
    })),
    ...(plan.ambient
      ? { ambient: plan.ambient.map(id => nameIndex.get(id) ?? id) }
      : {}),
  }

  const sequence = resolveIdleSequence(input.idle, request, candidates, nameIndex)

  if (!plan.cues.length) {
    animationLog.write('director', 'abort: plan has no cues', {
      affect: plan.affect,
      idleSteps: sequence?.steps.length ?? 0,
    })
    return null
  }

  animationLog.write('director', 'plan accepted', {
    cues: plan.cues.map(c => ({ anchor: c.anchor, clipId: c.clipId, intensity: c.intensity })),
    affect: plan.affect,
    idleSteps: sequence?.steps.length ?? 0,
  })
  return { plan, sequence, candidates }
}

/** Validates a plan the chat model wrote inline, inside its reply. */
export function resolveInlinePlan(planText: string, request: DirectorRequest): DirectorResult | null {
  const input = parseJsonObject(planText)
  if (!input)
    return null

  const { longActionIds, shortClips } = splitActionCandidates(request.catalog.clips, request.longActions ?? [])
  if (!shortClips.length)
    return null

  return acceptPlan(input, request, shortClips, longActionIds)
}

/**
 * Asks a chat model for one bounded performance plan.
 *
 * The call never throws to the chat flow. A timeout, provider error, invalid
 * JSON, or plan that fails validation returns null so the runtime keeps the
 * existing state machine.
 */
export async function requestPerformancePlan(request: DirectorRequest): Promise<DirectorResult | null> {
  // Long action names also exist as short clips in older packs. Keeping both in
  // the prompt makes the model pick the short clip for a named long action.
  const { longActionIds, shortClips } = splitActionCandidates(request.catalog.clips, request.longActions ?? [])
  const candidates = shortClips

  animationLog.write('director', 'requestPerformancePlan: start', {
    model: request.model,
    affectLabel: request.affect.label,
    affectVA: [request.affect.valence, request.affect.arousal],
    replyPreview: truncate(request.replyText, 60),
    catalogClips: candidates.length,
    recentClipIds: request.recentClipIds ?? [],
    longActionCount: request.longActions?.length ?? 0,
    candidates: candidates.map(c => ({ id: c.id, name: c.name, tags: c.tags, role: c.role })),
  })

  if (!candidates.length) {
    animationLog.write('director', 'abort: catalog is empty')
    return null
  }

  const controller = new AbortController()
  // The full catalog prompt makes the call slower. Waiting-phase steps still
  // arrive in time even when the reply-time cues miss their slot.
  const timeoutMs = request.timeoutMs ?? 35_000
  let timedOut = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(request, candidates, longActionIds) },
    { role: 'user' as const, content: buildUserPrompt(request) },
  ]
  const exchangeId = directorMonitor.begin({
    model: request.model,
    characterName: request.characterName,
  })

  try {
    const promptStart = performance.now()
    const content = await requestChatCompletion({
      baseUrl: request.baseUrl,
      apiKey: request.apiKey,
      model: request.model,
      signal: controller.signal,
      messages,
      onRequest: body => directorMonitor.addRequest(exchangeId, body),
      onResponse: body => directorMonitor.addResponse(exchangeId, body),
    })
    const promptMs = performance.now() - promptStart
    animationLog.write('director', 'LLM responded', { promptMs: Math.round(promptMs), rawPreview: truncate(content ?? '(empty)', 400) })
    directorMonitor.complete(exchangeId, Math.round(promptMs))

    const parsed = parseJsonObject(content)
    if (!parsed) {
      animationLog.write('director', 'abort: JSON parse failed')
      return null
    }

    animationLog.write('director', 'parsed JSON', { keys: Object.keys(parsed), parsed })

    return acceptPlan(parsed, request, candidates, longActionIds)
  }
  catch (error) {
    const name = error instanceof DOMException ? error.name : (error as Error | null)?.message ?? 'unknown'
    directorMonitor.fail(exchangeId, timedOut ? `${name}: timeout after ${timeoutMs}ms` : name)
    animationLog.write('director', `abort: ${name}`, { error })
    return null
  }
  finally {
    window.clearTimeout(timeout)
  }
}
