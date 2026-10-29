import type { AmbientPhase, AmbientProgram, CharacterCatalog } from '@proj-aipets/character-animation'

import type { DirectorLongAction } from './director'

import { parseAmbientProgram } from '@proj-aipets/character-animation'
import { portableProviderDefinitions } from '@proj-aipets/provider-inference'

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

export interface AmbientDirectorRequest {
  characterId: string
  characterName: string
  persona: string
  now: number
  catalog: CharacterCatalog
  longActions: DirectorLongAction[]
  connection: DirectorConnection
  timeoutMs?: number
}

const hour = 3_600_000
const minCycleHours = 20
const maxCycleHours = 28
const maxPhases = 8

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

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildSystemPrompt(request: AmbientDirectorRequest): string {
  const clips = request.catalog.clips
    .filter(clip => clip.role !== 'loop')
    .map(clip => ({ name: clip.name, tags: clip.tags }))
  const longActions = request.longActions.map(action => action.id)

  return [
    `你是「${request.characterName}」的作息编排导演。只输出一个 JSON 对象，不要 Markdown 或解释。`,
    request.persona ? `人设：${truncate(request.persona, 500)}` : '',
    '',
    '可用短动作（clips 只能填这里的 name）：',
    JSON.stringify(clips),
    '',
    longActions.length
      ? `可用长动作（holdLongAction 只能填这里的名称）：${JSON.stringify(longActions)}`
      : '当前没有可用长动作，所以每个阶段都不要填 holdLongAction。',
    '',
    '规则：',
    `- 编排从请求时刻开始的 ${minCycleHours} 到 ${maxCycleHours} 小时，phases 的 durationHours 之和要落在这个区间。`,
    `- phases 最多 ${maxPhases} 个，durationHours 在 0.5 到 12 之间。`,
    '- clips 是该阶段开始时按顺序播放一次的短动作，最多 3 个，可以为空数组。',
    '- holdLongAction 是填满该阶段剩余时间的长动作。只填名称，不要填文件路径。',
    '- 阶段顺序要符合日常作息。不要重复使用同一个 holdLongAction 相邻阶段的名称。',
    '',
    '输出示例：',
    '{"phases":[{"durationHours":4,"clips":["晨间刷牙","吃早餐"],"holdLongAction":"悠闲哼歌"}]}',
  ].filter(Boolean).join('\n')
}

function buildUserPrompt(request: AmbientDirectorRequest): string {
  return `现在时间：${new Date(request.now).toISOString()}。请编排从此刻开始的作息。`
}

/**
 * Converts the model phases into the duration based program shape.
 *
 * Unknown clip names and unknown long action names are dropped. A phase with no
 * usable step is dropped too, because it would freeze the stage for hours.
 */
function parseProgramPhases(
  parsed: Record<string, unknown>,
  request: AmbientDirectorRequest,
): AmbientPhase[] {
  const clipIdByName = new Map<string, string>()
  for (const clip of request.catalog.clips) {
    if (clip.role === 'loop' || clipIdByName.has(clip.name))
      continue
    clipIdByName.set(clip.name, clip.id)
  }

  const longActionNames = new Set(request.longActions.map(action => action.id))
  const rawPhases = Array.isArray(parsed.phases) ? parsed.phases : []
  const phases: AmbientPhase[] = []

  for (const raw of rawPhases) {
    if (phases.length >= maxPhases)
      break
    if (typeof raw !== 'object' || raw === null)
      continue

    const entry = raw as Record<string, unknown>
    const hours = readNumber(entry.durationHours)
    if (hours === null || hours < 0.5 || hours > 12)
      continue

    const rawClips = Array.isArray(entry.clips) ? entry.clips : []
    const clips: string[] = []
    for (const item of rawClips.slice(0, 3)) {
      if (typeof item !== 'string')
        continue
      const clipId = clipIdByName.get(item)
      if (clipId && !clips.includes(clipId))
        clips.push(clipId)
    }

    const hold = typeof entry.holdLongAction === 'string' && longActionNames.has(entry.holdLongAction)
      ? entry.holdLongAction
      : undefined

    if (!clips.length && !hold)
      continue

    phases.push({
      durationMs: Math.round(hours * hour),
      clips,
      ...(hold ? { holdLongAction: hold } : {}),
    })
  }

  return phases
}

/**
 * Asks the chat model for a 24 hour ambient program.
 *
 * A model error, an invalid response, or a cycle outside the accepted range
 * returns null. The caller then keeps the stored program or the built-in one.
 */
export async function requestAmbientProgram(request: AmbientDirectorRequest): Promise<AmbientProgram | null> {
  if (!request.catalog.clips.length)
    return null

  const controller = new AbortController()
  const timeoutMs = request.timeoutMs ?? 20_000
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  animationLog.write('ambient', 'requestAmbientProgram: start', {
    model: request.connection.model,
    clips: request.catalog.clips.length,
    longActions: request.longActions.length,
  })

  try {
    const content = await requestChatCompletion({
      baseUrl: request.connection.baseUrl,
      apiKey: request.connection.apiKey,
      model: request.connection.model,
      signal: controller.signal,
      messages: [
        { role: 'system', content: buildSystemPrompt(request) },
        { role: 'user', content: buildUserPrompt(request) },
      ],
    })

    const parsed = parseJsonObject(content)
    if (!parsed) {
      animationLog.write('ambient', 'abort: JSON parse failed')
      return null
    }

    const phases = parseProgramPhases(parsed, request)
    if (!phases.length) {
      animationLog.write('ambient', 'abort: no usable phase')
      return null
    }

    const totalHours = phases.reduce((sum, phase) => sum + phase.durationMs, 0) / hour
    if (totalHours < minCycleHours || totalHours > maxCycleHours) {
      animationLog.write('ambient', 'abort: cycle out of range', { totalHours })
      return null
    }

    const result = parseAmbientProgram({
      programVersion: 1,
      programId: `${request.characterId}-ambient-model-${request.now}`,
      characterId: request.characterId,
      anchorAt: new Date(request.now).toISOString(),
      phases,
    })
    if (!result.ok) {
      animationLog.write('ambient', 'abort: validation failed', { issues: result.issues })
      return null
    }

    animationLog.write('ambient', 'program accepted', {
      totalHours,
      phases: result.program.phases.map(phase => ({
        durationMs: phase.durationMs,
        clips: phase.clips.length,
        holdLongAction: phase.holdLongAction,
      })),
    })
    return result.program
  }
  catch (error) {
    const name = error instanceof DOMException ? error.name : (error as Error | null)?.message ?? 'unknown'
    animationLog.write('ambient', `abort: ${timedOut ? `${name}: timeout after ${timeoutMs}ms` : name}`, { error })
    return null
  }
  finally {
    clearTimeout(timeout)
  }
}
