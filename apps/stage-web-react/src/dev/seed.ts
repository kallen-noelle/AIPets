interface StoredProvider {
  id: string
  definitionId: string
  config: Record<string, unknown>
  status: string
  configuredBy: string
}

const devProviderId = 'dev-dashscope'
const dashScopeBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  }
  catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function writeDefault(key: string, value: unknown) {
  if (localStorage.getItem(key) === null)
    writeJson(key, value)
}

/**
 * Seeds the local DashScope provider for development.
 *
 * The key comes from `.env.local`, which is git-ignored and only exists on
 * this machine. Production builds and machines without the key are untouched.
 */
export function seedDevSettings() {
  if (!import.meta.env.DEV)
    return

  const apiKey = import.meta.env.VITE_DASHSCOPE_API_KEY
  if (!apiKey)
    return

  const configured = readJson<Record<string, StoredProvider>>(
    'settings/providers/configured',
    {},
  )

  const current = configured[devProviderId]
  if (!current || current.config.apiKey !== apiKey) {
    configured[devProviderId] = {
      id: devProviderId,
      definitionId: 'openai',
      config: {
        api: 'chat-completions',
        webSearch: false,
        apiKey,
        baseUrl: dashScopeBaseUrl,
      },
      status: 'configured',
      configuredBy: 'user',
    }
    writeJson('settings/providers/configured', configured)
  }

  // Keep the dev provider selected so a stale test provider cannot win.
  writeJson('aipets:react:chat/provider', devProviderId)
  writeJson('aipets:react:speech/provider', devProviderId)

  writeDefault('aipets:react:chat/model', 'qwen3.8-omni-flash')
  writeDefault('aipets:react:speech/model', 'qwen3-omni-flash')
  writeDefault('aipets:react:speech/voice', 'Cherry')
  writeDefault('aipets:react:image/model', 'wanx2.1-t2i-turbo')
  writeDefault('aipets:react:chat/tts', true)

  // The omni chat model has no audio output, so browser speech is the
  // working default. It needs no provider and keeps the test URL usable
  // without any extra setup.
  writeDefault('aipets:react:speech/local', true)
  writeDefault('aipets:react:speech/local-language', 'zh-CN')
  writeDefault('aipets:react:speech/local-voice', '')
  writeDefault('aipets:react:speech/local-rate', 1)
  writeDefault('aipets:react:speech/local-pitch', 1)

  // DashScope has no `/audio/transcriptions`. Its omni chat models read audio
  // directly, so dictation goes through the selected chat model.
  localStorage.removeItem('aipets:react:hearing/local')
  writeDefault('aipets:react:hearing/mode', 'omni')
  writeDefault('aipets:react:hearing/local-language', 'zh-CN')
}
