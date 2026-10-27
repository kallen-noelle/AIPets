import type { AffectState, ClipDescriptor, DayPlan, DayPlanBlock } from '@proj-airi/character-animation'

import { dayKeyAt, startOfNextDay, validateDayPlan } from '@proj-airi/character-animation'
import { portableProviderDefinitions } from '@proj-airi/provider-inference'

import { requestChatCompletion } from '../chat/client'
import { chatModelKey, chatProviderKey } from '../chat/types'
import { getProviders } from '../providers/store'
import { definitionHasTask } from '../providers/tasks'
import { readStored } from '../settings/persisted'
import { animationLog } from './animation-log'
import { parseJsonObject } from './director'
import { directorDefaults, directorModelKey } from './director-config'

export interface DirectorConnection {
  baseUrl: string
  apiKey: string
  model: string
}

export interface DayPlanDirectorRequest {
  characterId: string
  characterName: string
  persona: string
  affect: AffectState | null
  timezone: string
  now: number
  clips: ClipDescriptor[]
  longActionIds: string[]
  /** True when the user is in front of the stage. */
  userPresent: boolean
  connection: DirectorConnection
  timeoutMs?: number
}

export interface DayPlanDirectorResult {
  plan: DayPlan
  issues: string[]
}

/**
 * Resolves the chat model used for plan generation.
 *
 * It prefers the director model, then the chat model. A provider without an
 * API key still works because some local servers do not require one.
 */
export function resolveDirectorConnection(): DirectorConnection | null {
  const providers = getProviders()
  const entries = Object.values(providers)
  const selectedId = readStored(chatProviderKey, '')
  const provider = providers[selectedId] ?? entries.find((entry) => {
    const definition = portableProviderDefinitions.find(item => item.id === entry.definitionId)
    return definitionHasTask(definition?.tasks, 'chat')
  })

  if (!provider)
    return null

  const config = provider.config
  const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl
    ? config.baseUrl
    : 'https://api.openai.com/v1'

  return {
    baseUrl,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    model: readStored(directorModelKey, directorDefaults.model) || readStored(chatModelKey, '') || 'gpt-4o-mini',
  }
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildSystemPrompt(request: DayPlanDirectorRequest, clips: ClipDescriptor[]): string {
  const clipList = clips.map(clip => ({
    id: clip.id,
    name: clip.name,
    tags: clip.tags,
    role: clip.role,
    valence: clip.valence,
    arousal: clip.arousal,
  }))

  return [
    `你是“${request.characterName}”的日计划导演。只输出一个 JSON 对象，不要 Markdown 或解释。`,
    request.persona ? `角色设定：${truncate(request.persona, 500)}` : '',
    request.affect
      ? `当前情绪：valence ${request.affect.valence.toFixed(2)}，arousal ${request.affect.arousal.toFixed(2)}，label ${request.affect.label}。`
      : '当前情绪未知。',
    request.userPresent ? '用户当前在场，优先安排短动作，降低长动作优先级。' : '用户当前不在场，可以安排长动作。',
    '',
    '可用短片段（只能从这里选择 actionId）：',
    JSON.stringify(clipList),
    '',
    request.longActionIds.length
      ? `可用长动作（kind 为 long 时只能从这里选择 actionId）：${JSON.stringify(request.longActionIds)}`
      : '当前没有可用长动作，因此不要生成 kind 为 long 的块。',
    '',
    '规则：',
    '- 只安排从现在到本地午夜之间的时间，共 6 到 10 个块。',
    '- offsetMinutes 是距现在的分钟数，必须递增。',
    '- short 块的 durationMs 在 2000 到 10000 之间。',
    '- long 块的 durationMs 在 300000 到 1200000 之间。',
    '- priority 在 0 到 1 之间，interruptible 固定为 true。',
    '- 块之间不要重叠，不要使用列表以外的 actionId。',
    '',
    '输出示例：',
    '{"blocks":[{"offsetMinutes":20,"durationMs":300000,"kind":"long","actionId":"放风筝","priority":0.6,"interruptible":true}]}',
  ].filter(Boolean).join('\n')
}

function buildUserPrompt(request: DayPlanDirectorRequest): string {
  const zone = request.timezone
  return [
    `现在时间：${new Date(request.now).toISOString()}（时区 ${zone}）。`,
    '请为角色安排今天剩余时间的行为。',
  ].join('\n')
}

function parsePlanBlocks(
  parsed: Record<string, unknown>,
  request: DayPlanDirectorRequest,
  availableActionIds: Set<string>,
): DayPlanBlock[] {
  const expiresAt = startOfNextDay(request.now, request.timezone)
  const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : []
  const blocks: DayPlanBlock[] = []
  const minutesLeft = Math.max(0, Math.floor((expiresAt - request.now) / 60_000))

  for (const raw of rawBlocks) {
    if (blocks.length >= 10)
      break
    if (typeof raw !== 'object' || raw === null)
      continue

    const entry = raw as Record<string, unknown>
    const kind = entry.kind === 'long' ? 'long' : entry.kind === 'short' ? 'short' : null
    const actionId = typeof entry.actionId === 'string' ? entry.actionId : ''
    const offsetMinutes = readNumber(entry.offsetMinutes)
    const durationMs = readNumber(entry.durationMs)

    if (!kind || !actionId || offsetMinutes === null || durationMs === null)
      continue
    if (!availableActionIds.has(actionId))
      continue

    const start = request.now + clamp(Math.round(offsetMinutes), 0, minutesLeft) * 60_000
    const duration = kind === 'long'
      ? clamp(Math.round(durationMs), 5 * 60_000, 20 * 60_000)
      : clamp(Math.round(durationMs), 2_000, 10_000)

    if (start + duration > expiresAt)
      continue

    blocks.push({
      id: `block-${blocks.length + 1}`,
      startAt: new Date(start).toISOString(),
      durationMs: duration,
      kind,
      actionId,
      priority: clamp(readNumber(entry.priority) ?? (kind === 'long' ? 0.6 : 0.3), 0, 1),
      interruptible: true,
    })
  }

  blocks.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
  return blocks
}

/**
 * Asks the chat model for a coarse schedule for the rest of the day.
 *
 * A model error, an invalid response, or a plan with too few blocks returns
 * null. The caller then keeps the rule-based fallback, so playback never stops.
 */
export async function requestDayPlan(request: DayPlanDirectorRequest): Promise<DayPlanDirectorResult | null> {
  const clips = request.clips.filter(clip => clip.role !== 'loop')

  if (!clips.length)
    return null

  const availableActionIds = new Set([
    ...clips.map(clip => clip.id),
    ...request.longActionIds,
  ])

  const expiresAt = startOfNextDay(request.now, request.timezone)
  const remainingHours = (expiresAt - request.now) / 3_600_000
  const controller = new AbortController()
  const timeoutMs = request.timeoutMs ?? 15_000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  animationLog.write('day-plan', 'requestDayPlan: start', {
    model: request.connection.model,
    clips: clips.length,
    longActions: request.longActionIds.length,
    userPresent: request.userPresent,
  })

  try {
    const content = await requestChatCompletion({
      baseUrl: request.connection.baseUrl,
      apiKey: request.connection.apiKey,
      model: request.connection.model,
      signal: controller.signal,
      messages: [
        { role: 'system', content: buildSystemPrompt(request, clips) },
        { role: 'user', content: buildUserPrompt(request) },
      ],
    })

    const parsed = parseJsonObject(content)
    if (!parsed) {
      animationLog.write('day-plan', 'abort: JSON parse failed')
      return null
    }

    const blocks = parsePlanBlocks(parsed, request, availableActionIds)
    if (blocks.length < 6 && remainingHours >= 3) {
      animationLog.write('day-plan', 'abort: too few blocks', { blocks: blocks.length })
      return null
    }
    if (!blocks.length) {
      animationLog.write('day-plan', 'abort: no usable blocks')
      return null
    }

    const plan: DayPlan = {
      planVersion: 1,
      planId: `${dayKeyAt(request.now, request.timezone)}-${request.characterId}-model-${request.now}`,
      characterId: request.characterId,
      timezone: request.timezone,
      generatedAt: new Date(request.now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      blocks,
    }

    const validation = validateDayPlan(plan, {
      characterId: request.characterId,
      availableActionIds: [...availableActionIds],
      now: request.now,
      maxBlocks: 10,
    })
    if (!validation.ok || !validation.plan || !validation.plan.blocks.length) {
      animationLog.write('day-plan', 'abort: validation failed', { issues: validation.issues })
      return null
    }

    animationLog.write('day-plan', 'plan accepted', {
      blocks: validation.plan.blocks.map(block => ({
        startAt: block.startAt,
        kind: block.kind,
        actionId: block.actionId,
      })),
      issues: validation.issues,
    })
    return { plan: validation.plan, issues: validation.issues }
  }
  catch (error) {
    const name = error instanceof DOMException ? error.name : (error as Error | null)?.message ?? 'unknown'
    animationLog.write('day-plan', `abort: ${name}`, { error })
    return null
  }
  finally {
    clearTimeout(timeout)
  }
}
