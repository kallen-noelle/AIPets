import type { DirectorRequest, DirectorResult } from '../animation/director'
import type { DirectorAutonomy } from '../animation/director-config'
import type { MicErrorCode, Recorder } from '../audio/recorder'
import type { ChatTurn } from '../chat/client'
import type { ChatSession } from '../chat/sessions'
import type { ChatToolTrace } from '../chat/tools'
import type { ChatMessage } from '../chat/types'
import type { LocalRecognitionHandle } from '../speech/local-recognition'

import { errorMessageFrom } from '@moeru/std'
import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { animationLog } from '../animation/animation-log'
import { buildInlinePlanInstructions, requestPerformancePlan, resolveInlinePlan, splitInlinePlan } from '../animation/director'
import { directorBus } from '../animation/director-bus'
import {
  directorAutonomyKey,
  directorDefaults,
  directorMaxCuesKey,
  directorModelKey,
} from '../animation/director-config'
import { directorMonitor } from '../animation/director-monitor'
import { recentClipIds } from '../animation/playback-history'
import { sessionController } from '../animation/session-controller'
import { buildStatePrompt } from '../animation/state-context'
import { classifyMicError, startRecording } from '../audio/recorder'
import { affectStore, applyUserMessageAffect } from '../character/affect-store'
import { getActiveCharacterId, loadCharacterChatConfig } from '../character/characters'
import { streamChatTurn } from '../chat/client'
import { chatActiveSessionKey, chatSessionsKey, createSession, migrateLegacyMessages, sessionTitle } from '../chat/sessions'
import { resolveChatTools, runChatTool, toChatToolSchema } from '../chat/tools'
import {
  characterNameKey,
  characterPersonaKey,
  chatModelKey,
  chatProviderKey,
  memoryEnabledKey,
  memoryWindowKey,
} from '../chat/types'
import { generateImage } from '../image/generation'
import { composeMemoryPrompt, getMemoryEnabled, indexFor } from '../memory/store'
import { useProviders } from '../providers/store'
import { definitionHasTask } from '../providers/tasks'
import { readStored, useStoredValue } from '../settings/persisted'
import { isLocalRecognitionAvailable, startLocalRecognition } from '../speech/local-recognition'
import { transcribeWithOmni } from '../speech/omni-transcription'
import { speak, speakLocally, stopSpeaking } from '../speech/playback'
import { transcribeAudio } from '../speech/recognition'

const fieldClass = [
  'rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

const toolButtonClass = [
  'rounded-full border border-[var(--airi-border)] px-3 py-1.5 text-xs',
  'transition hover:bg-[var(--airi-hover)] disabled:opacity-40',
].join(' ')

/** How many tool rounds one turn may run before the model must answer. */
const MAX_TOOL_ROUNDS = 4

/** Opens the inline plan block the chat model appends after its reply. */
const PLAN_MARKER = '<<<PLAN'

/**
 * Keeps the last N chat rounds, where one round is one user message and the
 * replies after it. The model always sees complete pairs, and the first kept
 * message is a user turn.
 */
function takeRecentRounds(messages: ChatMessage[], rounds: number): ChatMessage[] {
  const kept: ChatMessage[] = []
  let counted = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message)
      continue

    if (message.role === 'user') {
      if (counted >= rounds)
        break
      counted += 1
    }

    kept.unshift(message)
  }

  return kept
}

/**
 * Returns the reply text before the inline plan block.
 *
 * Streaming splits text at arbitrary points, so a trailing partial marker is
 * held back until the next delta settles whether the model started a plan.
 */
function replyBeforePlan(raw: string): string {
  const at = raw.indexOf(PLAN_MARKER)
  if (at >= 0)
    return raw.slice(0, at)

  for (let size = Math.min(PLAN_MARKER.length - 1, raw.length); size > 0; size -= 1) {
    if (PLAN_MARKER.startsWith(raw.slice(-size)))
      return raw.slice(0, raw.length - size)
  }

  return raw
}

/**
 * Probes the browser's readiness for microphone access before we actually
 * ask getUserMedia or fire SpeechRecognition. Returns null when everything
 * looks fine, otherwise the error code we want to surface.
 */
async function preflightMicPermission(): Promise<MicErrorCode | null> {
  // getUserMedia only works in secure contexts (HTTPS, localhost).
  // Plain HTTP or file:// gets an unfixable SecurityError — catch it early.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    // localhost (any port) and 127.0.0.1 are treated as secure despite HTTP.
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0')
      return 'security'
  }

  // navigator.permissions is not present in every embedded context (some
  // Electron variants, older WebViews). Treat "unsupported" as non-fatal so
  // we can still probe via getUserMedia below.
  if (typeof navigator === 'undefined' || !navigator.permissions?.query)
    return null

  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    if (status.state === 'denied')
      return 'permission-denied'
    if (status.state === 'prompt')
      return null // let the real getUserMedia trigger the prompt
  }
  catch {
    // Some browsers throw on unknown permission names. Not fatal.
  }

  return null
}

function micErrorText(code: MicErrorCode, t: (key: string, opts?: { defaultValue?: string }) => string): string {
  switch (code) {
    case 'permission-denied':
      return t('settings.reactShell.chatMicDenied', {
        defaultValue: 'Microphone permission was denied. Allow it in the browser address bar and try again.',
      })
    case 'not-found':
      return t('settings.reactShell.chatMicMissing', {
        defaultValue: 'No microphone was found on this device.',
      })
    case 'not-readable':
      return t('settings.reactShell.chatMicBusy', {
        defaultValue: 'The microphone is already in use by another app.',
      })
    case 'overconstrained':
      return t('settings.reactShell.chatMicOverconstrained', {
        defaultValue: 'The microphone does not satisfy the requested constraints.',
      })
    case 'security':
      return t('settings.reactShell.chatMicInsecure', {
        defaultValue: 'Microphone access requires a secure context (HTTPS or localhost).',
      })
    case 'timeout':
      return t('settings.reactShell.chatMicTimeout', {
        defaultValue: 'The microphone did not respond in time.',
      })
    default:
      return t('settings.reactShell.chatMicUnknown', {
        defaultValue: 'The microphone could not be opened.',
      })
  }
}

export interface ChatPanelProps {
  /** `page` adds the session sidebar. `panel` fits beside the stage. */
  variant?: 'page' | 'panel'
}

export function ChatPanel({ variant = 'page' }: ChatPanelProps) {
  const { t } = useTranslation()
  const providers = useProviders()
  const compact = variant === 'panel'

  const [sessions, setSessions] = useStoredValue<ChatSession[]>(chatSessionsKey, [])
  const [activeId, setActiveId] = useStoredValue(chatActiveSessionKey, '')
  const [model, setModel] = useStoredValue(chatModelKey, '')
  const [providerId, setProviderId] = useStoredValue(chatProviderKey, '')
  const [ttsEnabled, setTtsEnabled] = useStoredValue('airi:react:chat/tts', false)
  const [speechProviderId] = useStoredValue('airi:react:speech/provider', '')
  const [characterName] = useStoredValue(characterNameKey, 'aipetdex')
  const [persona] = useStoredValue(characterPersonaKey, '')
  const [memoryEnabled] = useStoredValue(memoryEnabledKey, true)
  const [memoryWindow] = useStoredValue(memoryWindowKey, 10)
  const [packHistoryTurns, setPackHistoryTurns] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [starting, setStarting] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  const localRecognitionRef = useRef<LocalRecognitionHandle | null>(null)
  const recordingKindRef = useRef<'browser' | 'omni' | 'provider' | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const migrated = migrateLegacyMessages(sessions)
    if (migrated !== sessions)
      setSessions(migrated)

    if (migrated.length === 0) {
      const session = createSession()
      setSessions([session])
      setActiveId(session.id)
      return
    }

    if (!migrated.some(session => session.id === activeId))
      setActiveId(migrated[0].id)
  }, [])

  // A character pack can ship its own history limit in `config.json`.
  useEffect(() => {
    const characterId = getActiveCharacterId()
    if (!characterId)
      return

    let cancelled = false
    void loadCharacterChatConfig(characterId).then((config) => {
      if (!cancelled && config)
        setPackHistoryTurns(config.historyTurns)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const chatProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('chat') ?? false
  })

  const speechProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definitionHasTask(definition?.tasks, 'speech')
  })
  const speechProvider = speechProviders.find(provider => provider.id === speechProviderId) ?? speechProviders[0]

  const selected = chatProviders.find(provider => provider.id === providerId) ?? chatProviders[0]
  const active = sessions.find(session => session.id === activeId) ?? sessions[0]
  const messages = active?.messages ?? []
  const ready = Boolean(selected && active)
  const wasRecordingRef = useRef(false)

  useEffect(() => {
    if (recording && !wasRecordingRef.current)
      sessionController.notifyInteraction('voice-start')
    if (!recording && wasRecordingRef.current)
      sessionController.notifyInteraction('voice-end')
    wasRecordingRef.current = recording
  }, [recording])

  const patchSession = (id: string, update: (session: ChatSession) => ChatSession) => {
    setSessions(sessions.map(session => (session.id === id ? update(session) : session)))
  }

  const buildDirectorRequest = (
    replyText: string,
    history: ChatMessage[],
    connection: { baseUrl: string, apiKey: string },
  ): DirectorRequest | null => {
    const context = directorBus.getContext()
    const affect = affectStore.snapshot.state
    if (!context.active) {
      animationLog.write('director', 'skip: no active stage (open the stage page)')
      return null
    }
    if (!context.catalog) {
      animationLog.write('director', 'skip: catalog not loaded', {
        active: context.active,
        characterId: context.characterId,
        characterName: context.characterName,
      })
      return null
    }
    if (!affect) {
      animationLog.write('director', 'skip: affect state unavailable', { characterId: context.characterId })
      return null
    }

    const autonomy = readStored<DirectorAutonomy>(directorAutonomyKey, directorDefaults.autonomy)
    const maxCues = readStored(directorMaxCuesKey, directorDefaults.maxCues)
    const directorModel = readStored(directorModelKey, directorDefaults.model) || model || 'gpt-4o-mini'
    const turns = history.flatMap(message => message.role === 'user' || message.role === 'assistant'
      ? [{ role: message.role, content: message.content }]
      : [])
    const memoryIndex = getMemoryEnabled() ? indexFor(context.characterName || characterName) : ''

    return {
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: directorModel,
      characterName: context.characterName || characterName,
      persona: context.persona || persona,
      memory: memoryIndex ? composeMemoryPrompt(memoryIndex) : '',
      affect,
      catalog: context.catalog,
      history: turns,
      replyText,
      autonomy,
      maxCues,
      recentClipIds: recentClipIds(),
      longActions: context.longActions,
    }
  }

  const applyDirectorResult = (result: DirectorResult) => {
    animationLog.write('bus', 'emitPlan to stage', {
      cues: result.plan.cues.length,
      affect: result.plan.affect,
      idleSteps: result.sequence?.steps.length ?? 0,
    })
    directorBus.emitPlan(result.plan)
    if (result.sequence)
      directorBus.emitSequence(result.sequence)
  }

  const runDirector = (replyText: string, history: ChatMessage[], connection: { baseUrl: string, apiKey: string }) => {
    const request = buildDirectorRequest(replyText, history, connection)
    if (!request)
      return

    animationLog.write('director', 'run: calling director model', {
      directorModel: request.model,
      chatModel: model,
      autonomy: request.autonomy,
      maxCues: request.maxCues,
      catalogClips: request.catalog.clips.length,
      replyPreview: replyText.slice(0, 60),
    })

    void requestPerformancePlan(request).then((result) => {
      if (result)
        applyDirectorResult(result)
      else
        animationLog.write('director', 'plan dropped: no usable result')
    })
  }

  const runCompletion = async (session: ChatSession, history: ChatMessage[]) => {
    if (!selected)
      return

    const config = selected.config
    const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl
      ? config.baseUrl
      : 'https://api.openai.com/v1'
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey : ''

    const controller = new AbortController()
    abortRef.current = controller

    setSending(true)
    setStreamText('')
    setError(null)
    directorBus.emitEvent({ type: 'thinking', value: true })
    // Clear the previous reply so the head bubble tracks this turn only.
    directorBus.emitBubble(null)

    const conversation = history.filter(message => message.role !== 'system')
    // The settings slider wins once the user moves it. Otherwise the pack
    // `config.json` value applies, and 10 is the last fallback. Both values
    // count rounds, so every kept round carries the character reply.
    const historyTurns = localStorage.getItem(memoryWindowKey) === null && packHistoryTurns !== null
      ? packHistoryTurns
      : memoryWindow
    const visible = memoryEnabled ? takeRecentRounds(conversation, Math.max(2, historyTurns)) : conversation.slice(-1)
    const basePrompt = persona.trim()
      ? `You are ${characterName}.\n${persona.trim()}`
      : `You are ${characterName}.`
    const memoryIndex = getMemoryEnabled() ? indexFor(characterName) : ''
    // With the director on, the reply and the plan share one call. The plan
    // section only adds state, candidates, rules, and the output format.
    const inlineRequest = buildDirectorRequest('', history, { baseUrl, apiKey })
    const planInstructions = inlineRequest ? buildInlinePlanInstructions(inlineRequest) : ''
    // The inline plan section already carries the state facts. Without it, the
    // state must still reach the reply, so the reply follows the current world
    // and character facts even when the director is off.
    const statePrompt = planInstructions
      ? ''
      : buildStatePrompt({
          affect: affectStore.snapshot.state,
          recentClipIds: recentClipIds(),
          now: new Date(),
        })
    const systemPrompt = [
      memoryIndex ? `${basePrompt}${composeMemoryPrompt(memoryIndex)}` : basePrompt,
      statePrompt,
      planInstructions,
    ].filter(Boolean).join('\n\n')

    const tools = resolveChatTools(characterName)
    const toolSchemas = tools.map(toChatToolSchema)

    const turns: ChatTurn[] = [
      { role: 'system', content: systemPrompt },
      ...visible.map((message): ChatTurn => {
        if (message.image && message.role === 'user') {
          return {
            role: message.role,
            content: [
              { type: 'text' as const, text: message.content },
              { type: 'image_url' as const, image_url: { url: message.image } },
            ],
          }
        }

        return { role: message.role, content: message.content }
      }),
    ]

    // The monitor records every chat model call. The call also carries the
    // director plan when the director is on, so one exchange covers both.
    const monitorStart = performance.now()
    const monitorId = directorMonitor.begin({ model: model || 'gpt-4o-mini', characterName })

    let accumulated = ''
    const traces: ChatToolTrace[] = []
    let replyStarted = false
    let replyEnded = false
    let sentenceCount = 0

    const startReply = () => {
      if (replyStarted)
        return
      replyStarted = true
      directorBus.emitTimeline({ type: 'reply-start', at: Date.now() })
      sessionController.notifyReplyStart()
    }

    const endReply = () => {
      if (replyEnded)
        return
      replyEnded = true
      directorBus.emitTimeline({ type: 'speech-end', at: Date.now() })
      sessionController.notifyReplyEnd()
    }

    try {
      // The model can ask for tools, read the results, and ask again. The last
      // round offers no tools, so the turn always ends with a reply.
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const allowTools = round < MAX_TOOL_ROUNDS
        const reply = await streamChatTurn({
          baseUrl,
          apiKey,
          model: model || 'gpt-4o-mini',
          signal: controller.signal,
          messages: turns,
          tools: allowTools && toolSchemas.length ? toolSchemas : undefined,
          onRequest: (body: string) => directorMonitor.addRequest(monitorId, body),
          onResponse: (body: string) => directorMonitor.addResponse(monitorId, body),
        }, (delta) => {
          accumulated += delta
          const shownText = inlineRequest ? replyBeforePlan(accumulated) : accumulated
          setStreamText(shownText)
          // Stream into the head bubble so it mirrors the reply in real time.
          directorBus.emitBubble(shownText)
          startReply()

          const sentences = (shownText.match(/[。！？!?]/g) ?? []).length
          while (sentenceCount < sentences) {
            sentenceCount += 1
            directorBus.emitTimeline({ type: 'sentence', index: sentenceCount, at: Date.now() })
          }
        })

        // One entry per round, so the panel shows the assembled reply text
        // instead of the raw SSE chunks.
        directorMonitor.addReply(
          monitorId,
          reply.content,
          reply.toolCalls.map(call => `${call.name} ${call.arguments}`).join('\n'),
        )

        if (!reply.toolCalls.length)
          break

        turns.push({
          role: 'assistant',
          content: reply.content || null,
          tool_calls: reply.toolCalls.map(call => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        })

        for (const call of reply.toolCalls) {
          setActiveTool(call.name)
          animationLog.write('tools', `call ${call.name}`, { arguments: call.arguments.slice(0, 200) })
          const trace = await runChatTool(tools, call, controller.signal)
          traces.push(trace)
          animationLog.write('tools', `result ${call.name}`, {
            ok: trace.ok,
            result: trace.result.slice(0, 200),
          })
          turns.push({ role: 'tool', tool_call_id: call.id, content: trace.result })
        }
        setActiveTool(null)
      }

      directorMonitor.complete(monitorId, Math.round(performance.now() - monitorStart))

      const { replyText, planText } = inlineRequest
        ? splitInlinePlan(accumulated)
        : { replyText: accumulated, planText: '' }

      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: replyText,
        createdAt: Date.now(),
        ...(traces.length ? { toolCalls: traces } : {}),
      }

      patchSession(session.id, current => ({
        ...current,
        messages: [...history, assistant],
        updatedAt: Date.now(),
      }))

      if (inlineRequest) {
        const result = planText ? resolveInlinePlan(planText, inlineRequest) : null
        directorMonitor.setPlan(
          monitorId,
          planText || null,
          result
            ? `applied · cues ${result.plan.cues.length} · idle steps ${result.sequence?.steps.length ?? 0}`
            : planText ? 'rejected by validation · falling back' : 'no plan block · falling back',
        )
        // A reply without an action is incomplete. Ask a dedicated call for the
        // plan so the turn still ends with at least one cue.
        if (result) {
          applyDirectorResult(result)
        }
        else {
          animationLog.write('director', 'inline plan dropped; falling back to director call')
          runDirector(replyText, history, { baseUrl, apiKey })
        }
      }
      else {
        directorMonitor.setPlan(monitorId, null, 'not requested: the director is off')
        runDirector(replyText, history, { baseUrl, apiKey })
      }

      if (ttsEnabled) {
        const localSpeech = readStored('airi:react:speech/local', true)

        if (localSpeech || !speechProvider) {
          void speakLocally(replyText, {
            lang: readStored('airi:react:speech/local-language', 'zh-CN'),
            voiceURI: readStored('airi:react:speech/local-voice', ''),
            rate: readStored('airi:react:speech/local-rate', 1),
            pitch: readStored('airi:react:speech/local-pitch', 1),
          }).catch((speechError: unknown) => {
            setError(errorMessageFrom(speechError) ?? 'Speech playback failed')
          }).finally(endReply)
        }
        else {
          const speechConfig = speechProvider.config
          const speechBaseUrl = typeof speechConfig.baseUrl === 'string' && speechConfig.baseUrl
            ? speechConfig.baseUrl
            : 'https://api.openai.com/v1'

          void speak(replyText, {
            baseUrl: speechBaseUrl,
            apiKey: typeof speechConfig.apiKey === 'string' ? speechConfig.apiKey : '',
            model: readStored('airi:react:speech/model', ''),
            voice: readStored('airi:react:speech/voice', ''),
          }).catch((speechError: unknown) => {
            setError(errorMessageFrom(speechError) ?? 'Speech playback failed')
          }).finally(endReply)
        }
      }
    }
    catch (cause) {
      directorMonitor.fail(
        monitorId,
        controller.signal.aborted ? 'aborted by user' : (errorMessageFrom(cause) ?? 'request failed'),
      )

      const partial = inlineRequest ? replyBeforePlan(accumulated) : accumulated
      if (controller.signal.aborted) {
        if (partial) {
          patchSession(session.id, current => ({
            ...current,
            messages: [...history, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: partial,
              createdAt: Date.now(),
              ...(traces.length ? { toolCalls: traces } : {}),
            }],
            updatedAt: Date.now(),
          }))
        }
      }
      else {
        setError(errorMessageFrom(cause) ?? 'Request failed')
        // A failed turn must not leave partial text hanging above the head.
        directorBus.emitBubble(partial || null)
      }
    }
    finally {
      abortRef.current = null
      setSending(false)
      setStreamText('')
      setActiveTool(null)
      directorBus.emitEvent({ type: 'thinking', value: false })
      // Speech owns the reply end when it plays. Without speech, the text end
      // decides when the session returns to waiting.
      if (!ttsEnabled)
        endReply()
    }
  }

  /**
   * Sends one user turn.
   *
   * A quick action passes its own preset text and skips the composer, so the
   * user can ask for a scene with one click.
   */
  const send = (preset?: string) => {
    const text = (preset ?? input).trim()
    if ((!text && !pendingImage) || !selected || !active || sending)
      return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      image: preset === undefined ? pendingImage ?? undefined : undefined,
    }
    const history = [...messages, userMessage]

    applyUserMessageAffect(text)
    sessionController.notifyInteraction('submit')
    patchSession(active.id, session => ({ ...session, messages: history, updatedAt: Date.now() }))
    // A quick action leaves the composer alone, so a typed draft survives it.
    if (preset === undefined) {
      setInput('')
      setPendingImage(null)
    }
    void runCompletion(active, history)
  }

  const toggleRecording = async () => {
    try {
      if (recording) {
        const kind = recordingKindRef.current
        recordingKindRef.current = null

        if (kind === 'browser' && localRecognitionRef.current) {
          const handle = localRecognitionRef.current
          localRecognitionRef.current = null
          setRecording(false)

          const text = (await handle.stop()).trim()
          if (text)
            setInput(current => (current ? `${current} ${text}` : text))

          return
        }

        const recordingResult = await recorderRef.current?.stop()
        recorderRef.current = null
        setRecording(false)

        if (!recordingResult || !selected)
          return

        const config = selected.config
        const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl
          ? config.baseUrl
          : 'https://api.openai.com/v1'
        const apiKey = typeof config.apiKey === 'string' ? config.apiKey : ''

        setTranscribing(true)

        try {
          const text = kind === 'omni'
            ? await transcribeWithOmni(recordingResult.data, { baseUrl, apiKey, model: model || 'qwen3.8-omni-flash' })
            : await transcribeAudio(recordingResult.data, { baseUrl, apiKey, model })

          if (text)
            setInput(current => (current ? `${current} ${text}` : text))
        }
        finally {
          setTranscribing(false)
        }

        return
      }

      // --- Start path: pre-check before touching any mic API ---
      const preflight = await preflightMicPermission()
      if (preflight) {
        setError(micErrorText(preflight, t))
        return
      }

      const hearingMode = readStored<'omni' | 'browser' | 'provider'>('airi:react:hearing/mode', 'omni')

      if (hearingMode === 'browser' && isLocalRecognitionAvailable()) {
        localRecognitionRef.current = startLocalRecognition({
          lang: readStored('airi:react:hearing/local-language', 'zh-CN'),
          onError: (message) => {
            // local-recognition surfaces SpeechRecognition codes (e.g.
            // "Browser speech recognition failed: not-allowed") as plain
            // strings. Run them through the shared classifier so we give the
            // user the right guidance instead of a raw code.
            setError(micErrorText(classifyMicError(new Error(message)), t))
            setRecording(false)
            setStarting(false)
            localRecognitionRef.current?.cancel()
            localRecognitionRef.current = null
            recordingKindRef.current = null
          },
        })
        recordingKindRef.current = 'browser'
        setRecording(true)
        setError(null)
        return
      }

      if (!selected) {
        setError(t('settings.reactShell.chatNeedProvider', {
          defaultValue: 'Add a chat provider before you use the microphone.',
        }))
        return
      }

      if (hearingMode !== 'omni' && !model) {
        setError(t('settings.reactShell.chatNeedModel', {
          defaultValue: 'Select a chat model before you use the microphone.',
        }))
        return
      }

      setStarting(true)

      recorderRef.current = await startRecording()
      recordingKindRef.current = hearingMode === 'provider' ? 'provider' : 'omni'
      setStarting(false)
      setRecording(true)
      setError(null)
    }
    catch (cause) {
      setStarting(false)
      setRecording(false)
      recorderRef.current = null
      localRecognitionRef.current = null
      recordingKindRef.current = null

      // Console diagnostics to pin down the real browser-side failure so we
      // can extend classifyMicError instead of guessing from the message.
      console.warn('[aipetdex] microphone error', cause)
      const errorLike = cause as { name?: string, code?: number, message?: string } | null
      const name = errorLike?.name ?? 'unknown-name'
      const message = errorLike?.message ?? String(cause)
      setError(`${micErrorText(classifyMicError(cause), t)}  (${name}: ${message})`)
    }
  }

  const pickImage = (file: File | undefined) => {
    if (!file)
      return

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string')
        setPendingImage(reader.result)
    })
    reader.readAsDataURL(file)
  }

  const draw = async () => {
    const prompt = input.trim()
    if (!prompt || !selected || !active || drawing)
      return

    const config = selected.config
    const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl
      ? config.baseUrl
      : 'https://api.openai.com/v1'

    setDrawing(true)
    setError(null)

    try {
      const url = await generateImage(prompt, {
        baseUrl,
        apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
        model: readStored('airi:react:image/model', ''),
      })

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: prompt,
        createdAt: Date.now(),
        image: url,
      }

      patchSession(active.id, session => ({
        ...session,
        messages: [...messages, message],
        updatedAt: Date.now(),
      }))
      setInput('')
    }
    catch (cause) {
      setError(errorMessageFrom(cause) ?? 'Image generation failed')
    }
    finally {
      setDrawing(false)
    }
  }

  const regenerate = () => {
    if (!active || sending || messages.length === 0)
      return

    const reversedIndex = [...messages].reverse().findIndex(message => message.role === 'user')
    if (reversedIndex < 0)
      return

    const history = messages.slice(0, messages.length - reversedIndex)
    patchSession(active.id, session => ({ ...session, messages: history, updatedAt: Date.now() }))
    void runCompletion(active, history)
  }

  const stop = () => {
    abortRef.current?.abort()
    localRecognitionRef.current?.cancel()
    localRecognitionRef.current = null
    recordingKindRef.current = null
    setRecording(false)
    stopSpeaking()
  }

  const newSession = () => {
    const session = createSession()
    setSessions([session, ...sessions])
    setActiveId(session.id)
    setError(null)
  }

  const deleteSession = (id: string) => {
    const next = sessions.filter(session => session.id !== id)
    if (next.length === 0) {
      const session = createSession()
      setSessions([session])
      setActiveId(session.id)
      return
    }

    setSessions(next)
    if (activeId === id)
      setActiveId(next[0].id)
  }

  return (
    <div className={compact ? 'h-full min-h-0 flex' : 'min-h-screen flex'} style={{ background: 'var(--airi-bg)', color: 'var(--airi-fg)' }}>
      {!compact && (
        <aside className="w-56 shrink-0 flex-col gap-2 border-r border-[var(--airi-border)] p-3 hidden sm:flex">
          <Link to="/" className="text-sm text-[var(--airi-muted)] hover:text-[var(--airi-fg)]">
            <span className="i-solar:alt-arrow-left-line-duotone" />
            {' '}
            {t('settings.reactShell.backToStage', { defaultValue: 'Back to stage' })}
          </Link>

          <button
            type="button"
            className="mt-2 rounded-xl bg-[var(--airi-fg)] px-3 py-2 text-sm text-[var(--airi-bg)] font-medium"
            onClick={newSession}
          >
            {t('settings.reactShell.chatNew', { defaultValue: 'New chat' })}
          </button>

          <div className="mt-2 flex flex-col gap-1 overflow-y-auto">
            {sessions.map(session => (
              <div
                key={session.id}
                className={[
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
                  session.id === active?.id ? 'bg-[var(--airi-card)]' : 'hover:bg-[var(--airi-hover)]',
                ].join(' ')}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => setActiveId(session.id)}
                >
                  {sessionTitle(session, t('settings.reactShell.chatUntitled', { defaultValue: 'New chat' }))}
                </button>
                <button
                  type="button"
                  className="text-[var(--airi-muted)] hover:text-rose-400"
                  aria-label={t('settings.reactShell.chatDelete', { defaultValue: 'Delete' })}
                  onClick={() => deleteSession(session.id)}
                >
                  <span className="i-solar:trash-bin-trash-bold-duotone" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className={compact ? 'flex min-h-0 flex-1 flex-col' : 'min-h-screen min-w-0 flex flex-1 flex-col'}>
        <header className={compact
          ? 'flex w-full flex-col gap-2 px-4 py-3'
          : 'mx-auto max-w-3xl w-full flex flex-wrap items-center justify-between gap-3 px-4 py-4'}
        >
          <div className="flex items-center justify-between gap-2">
            <h1 className={compact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>
              {t('settings.reactShell.chatTitle', { defaultValue: 'Chat' })}
            </h1>
            {compact && (
              <div className="flex items-center gap-2">
                <select
                  className={`${fieldClass} max-w-40 text-xs`}
                  value={active?.id ?? ''}
                  onChange={event => setActiveId(event.target.value)}
                >
                  {sessions.map(session => (
                    <option key={session.id} value={session.id}>
                      {sessionTitle(session, t('settings.reactShell.chatUntitled', { defaultValue: 'New chat' }))}
                    </option>
                  ))}
                </select>
                <button type="button" className={toolButtonClass} onClick={newSession} aria-label="New chat">+</button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className={fieldClass}
              value={selected?.id ?? ''}
              onChange={event => setProviderId(event.target.value)}
            >
              {chatProviders.length === 0 && <option value="">—</option>}
              {chatProviders.map((provider) => {
                const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
                return (
                  <option key={provider.id} value={provider.id}>
                    {definition?.name ?? provider.definitionId}
                  </option>
                )
              })}
            </select>

            <input
              className={`${fieldClass} w-36`}
              value={model}
              placeholder="gpt-4o-mini"
              onChange={event => setModel(event.target.value)}
            />

            <label className="flex items-center gap-1 text-xs text-[var(--airi-muted)]">
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={event => setTtsEnabled(event.target.checked)}
              />
              {t('settings.reactShell.chatTts', { defaultValue: 'Read replies' })}
            </label>
          </div>
        </header>

        <main className="mx-auto max-w-3xl min-h-0 w-full flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--airi-muted)]">
              {ready
                ? t('settings.reactShell.chatEmpty', { defaultValue: 'Say something to start.' })
                : t('settings.reactShell.chatNoProvider', {
                    defaultValue: 'Configure a chat provider in settings first.',
                  })}
            </p>
          )}

          {messages.map(message => (
            <div
              key={message.id}
              className={[
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm',
                message.role === 'user'
                  ? 'self-end bg-[var(--airi-fg)] text-[var(--airi-bg)]'
                  : 'self-start bg-[var(--airi-card)]',
              ].join(' ')}
            >
              {message.content}
              {message.image && (
                <img src={message.image} alt="" className="mt-2 max-h-60 rounded-lg" />
              )}
              {message.toolCalls?.length && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--airi-border)] pt-2 text-xs">
                  {message.toolCalls.map(trace => (
                    <li key={trace.id}>
                      <details>
                        <summary className={trace.ok ? 'cursor-pointer text-[var(--airi-muted)]' : 'cursor-pointer text-rose-400'}>
                          {trace.name}
                        </summary>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[var(--airi-muted)]">
                          {trace.arguments}
                          {'\n\n'}
                          {trace.result}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {sending && (
            <div className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl bg-[var(--airi-card)] px-4 py-2 text-sm">
              {streamText || (activeTool
                ? t('settings.reactShell.chatCallingTool', {
                    defaultValue: 'Calling {{tool}}...',
                    tool: activeTool,
                  })
                : t('settings.reactShell.chatThinking', { defaultValue: 'Thinking...' }))}
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </main>

        <footer className="mx-auto max-w-3xl w-full flex flex-col gap-2 px-4 pb-4">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              pickImage(event.target.files?.[0])
              event.target.value = ''
            }}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={toolButtonClass}
              disabled={!ready || sending || starting || transcribing}
              onClick={() => void toggleRecording()}
            >
              <span className={[
                'i-solar:',
                recording || starting || transcribing
                  ? 'microphone-off-bold-duotone'
                  : 'microphone-bold-duotone',
              ].join('')}
              />
              {transcribing
                ? t('settings.reactShell.chatTranscribing', { defaultValue: 'Transcribing...' })
                : starting
                  ? t('settings.reactShell.chatPreparing', { defaultValue: 'Opening...' })
                  : recording
                    ? t('settings.reactShell.chatStopListening', { defaultValue: 'Stop' })
                    : t('settings.reactShell.chatListen', { defaultValue: 'Listen' })}
            </button>

            <button
              type="button"
              className={toolButtonClass}
              disabled={!ready || sending}
              onClick={() => imageInputRef.current?.click()}
            >
              <span className="i-solar:gallery-bold-duotone" />
              {t('settings.reactShell.chatAttach', { defaultValue: 'Image' })}
            </button>

            <button
              type="button"
              className={toolButtonClass}
              disabled={!ready || sending || drawing || !input.trim()}
              onClick={() => void draw()}
            >
              <span className="i-solar:palette-bold-duotone" />
              {drawing
                ? t('settings.reactShell.chatDrawing', { defaultValue: 'Drawing...' })
                : t('settings.reactShell.chatDraw', { defaultValue: 'Draw' })}
            </button>

            <button
              type="button"
              className={toolButtonClass}
              disabled={!ready || sending}
              onClick={() => send(t('settings.reactShell.chatKitePrompt', {
                defaultValue: 'Fly a kite for me.',
              }))}
            >
              <span className="i-solar:magic-stick-3-bold-duotone" />
              {t('settings.reactShell.chatKite', { defaultValue: 'Fly a kite' })}
            </button>

            {sending
              ? (
                  <button type="button" className={toolButtonClass} onClick={stop}>
                    <span className="i-solar:stop-bold-duotone" />
                    {t('settings.reactShell.chatStop', { defaultValue: 'Stop' })}
                  </button>
                )
              : (
                  <button
                    type="button"
                    className={toolButtonClass}
                    disabled={!ready || messages.length === 0}
                    onClick={regenerate}
                  >
                    <span className="i-solar:refresh-bold-duotone" />
                    {t('settings.reactShell.chatRegenerate', { defaultValue: 'Regenerate' })}
                  </button>
                )}

            <button
              type="button"
              className={toolButtonClass}
              disabled={!active || messages.length === 0}
              onClick={() => active && patchSession(active.id, session => ({ ...session, messages: [] }))}
            >
              <span className="i-solar:trash-bin-trash-bold-duotone" />
              {t('settings.reactShell.chatClear', { defaultValue: 'Clear' })}
            </button>
          </div>

          {pendingImage && (
            <div className="flex items-center gap-2">
              <img src={pendingImage} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button
                type="button"
                className="text-xs text-[var(--airi-muted)] hover:text-rose-400"
                onClick={() => setPendingImage(null)}
              >
                {t('settings.reactShell.chatRemoveImage', { defaultValue: 'Remove image' })}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              className={`${fieldClass} flex-1`}
              value={input}
              disabled={!ready || sending}
              placeholder={t('settings.reactShell.chatPlaceholder', { defaultValue: 'Type a message' })}
              onChange={(event) => {
                setInput(event.target.value)
                sessionController.notifyInteraction('input')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey)
                  send()
              }}
            />
            <button
              type="button"
              disabled={!ready || sending || (!input.trim() && !pendingImage)}
              onClick={() => send()}
              className="rounded-xl bg-[var(--airi-fg)] px-4 py-2 text-sm text-[var(--airi-bg)] font-medium disabled:opacity-40"
            >
              <span className="i-solar:send-bold-duotone" />
              {' '}
              {t('settings.reactShell.chatSend', { defaultValue: 'Send' })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
