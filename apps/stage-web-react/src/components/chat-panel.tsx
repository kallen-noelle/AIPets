import type { Recorder } from '../audio/recorder'
import type { ChatSession } from '../chat/sessions'
import type { ChatMessage } from '../chat/types'
import type { LocalRecognitionHandle } from '../speech/local-recognition'

import { errorMessageFrom } from '@moeru/std'
import { portableProviderDefinitions } from '@proj-airi/provider-inference'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { startRecording } from '../audio/recorder'
import { applyUserMessageAffect } from '../character/affect-store'
import { streamChatCompletion } from '../chat/client'
import { chatActiveSessionKey, chatSessionsKey, createSession, migrateLegacyMessages, sessionTitle } from '../chat/sessions'
import {
  characterNameKey,
  characterPersonaKey,
  chatModelKey,
  chatProviderKey,
  memoryEnabledKey,
  memoryWindowKey,
} from '../chat/types'
import { generateImage } from '../image/generation'
import { useProviders } from '../providers/store'
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
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('')
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

  const chatProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('chat') ?? false
  })

  const speechProviders = Object.values(providers).filter((provider) => {
    const definition = portableProviderDefinitions.find(item => item.id === provider.definitionId)
    return definition?.tasks.includes('speech') ?? false
  })
  const speechProvider = speechProviders.find(provider => provider.id === speechProviderId) ?? speechProviders[0]

  const selected = chatProviders.find(provider => provider.id === providerId) ?? chatProviders[0]
  const active = sessions.find(session => session.id === activeId) ?? sessions[0]
  const messages = active?.messages ?? []
  const ready = Boolean(selected && active)

  const patchSession = (id: string, update: (session: ChatSession) => ChatSession) => {
    setSessions(sessions.map(session => (session.id === id ? update(session) : session)))
  }

  const runCompletion = async (session: ChatSession, history: ChatMessage[]) => {
    if (!selected)
      return

    const config = selected.config
    const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl
      ? config.baseUrl
      : 'https://api.openai.com/v1'

    const controller = new AbortController()
    abortRef.current = controller

    setSending(true)
    setStreamText('')
    setError(null)

    const conversation = history.filter(message => message.role !== 'system')
    const visible = memoryEnabled ? conversation.slice(-Math.max(2, memoryWindow)) : conversation.slice(-1)
    const systemPrompt = persona.trim()
      ? `You are ${characterName}.\n${persona.trim()}`
      : `You are ${characterName}.`

    let accumulated = ''

    try {
      await streamChatCompletion({
        baseUrl,
        apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
        model: model || 'gpt-4o-mini',
        signal: controller.signal,
        messages: [
          { role: 'system', content: systemPrompt },
          ...visible.map((message) => {
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
        ],
      }, (delta) => {
        accumulated += delta
        setStreamText(accumulated)
      })

      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: accumulated,
        createdAt: Date.now(),
      }

      patchSession(session.id, current => ({
        ...current,
        messages: [...history, assistant],
        updatedAt: Date.now(),
      }))

      if (ttsEnabled) {
        const localSpeech = readStored('airi:react:speech/local', true)

        if (localSpeech || !speechProvider) {
          void speakLocally(accumulated, {
            lang: readStored('airi:react:speech/local-language', 'zh-CN'),
            voiceURI: readStored('airi:react:speech/local-voice', ''),
            rate: readStored('airi:react:speech/local-rate', 1),
            pitch: readStored('airi:react:speech/local-pitch', 1),
          }).catch((speechError: unknown) => {
            setError(errorMessageFrom(speechError) ?? 'Speech playback failed')
          })
        }
        else {
          const speechConfig = speechProvider.config
          const speechBaseUrl = typeof speechConfig.baseUrl === 'string' && speechConfig.baseUrl
            ? speechConfig.baseUrl
            : 'https://api.openai.com/v1'

          void speak(accumulated, {
            baseUrl: speechBaseUrl,
            apiKey: typeof speechConfig.apiKey === 'string' ? speechConfig.apiKey : '',
            model: readStored('airi:react:speech/model', ''),
            voice: readStored('airi:react:speech/voice', ''),
          }).catch((speechError: unknown) => {
            setError(errorMessageFrom(speechError) ?? 'Speech playback failed')
          })
        }
      }
    }
    catch (cause) {
      if (controller.signal.aborted) {
        if (accumulated) {
          patchSession(session.id, current => ({
            ...current,
            messages: [...history, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: accumulated,
              createdAt: Date.now(),
            }],
            updatedAt: Date.now(),
          }))
        }
      }
      else {
        setError(errorMessageFrom(cause) ?? 'Request failed')
      }
    }
    finally {
      abortRef.current = null
      setSending(false)
      setStreamText('')
    }
  }

  const send = () => {
    const text = input.trim()
    if ((!text && !pendingImage) || !selected || !active || sending)
      return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      image: pendingImage ?? undefined,
    }
    const history = [...messages, userMessage]

    applyUserMessageAffect(text)
    patchSession(active.id, session => ({ ...session, messages: history, updatedAt: Date.now() }))
    setInput('')
    setPendingImage(null)
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

      const hearingMode = readStored<'omni' | 'browser' | 'provider'>('airi:react:hearing/mode', 'omni')

      if (hearingMode === 'browser' && isLocalRecognitionAvailable()) {
        localRecognitionRef.current = startLocalRecognition({
          lang: readStored('airi:react:hearing/local-language', 'zh-CN'),
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

      const message = errorMessageFrom(cause) ?? ''

      if (/permission|denied|notallowed/i.test(message)) {
        setError(t('settings.reactShell.chatMicDenied', {
          defaultValue: 'Microphone permission was denied. Allow it in the browser address bar and try again.',
        }))
      }
      else if (/notfound|requested device|no microphone/i.test(message)) {
        setError(t('settings.reactShell.chatMicMissing', {
          defaultValue: 'No microphone was found on this device.',
        }))
      }
      else {
        setError(message || 'Recording failed')
      }
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
            </div>
          ))}

          {sending && (
            <div className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl bg-[var(--airi-card)] px-4 py-2 text-sm">
              {streamText || t('settings.reactShell.chatThinking', { defaultValue: 'Thinking...' })}
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
              onChange={event => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey)
                  send()
              }}
            />
            <button
              type="button"
              disabled={!ready || sending || (!input.trim() && !pendingImage)}
              onClick={send}
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
