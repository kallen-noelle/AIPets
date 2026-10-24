export interface ImageGenerationOptions {
  baseUrl: string
  apiKey: string
  model?: string
}

interface TaskResponse {
  output?: {
    task_id?: string
    task_status?: string
    results?: Array<{ url?: string }>
    message?: string
  }
  message?: string
}

interface ImagesResponse {
  data?: Array<{ url?: string, b64_json?: string }>
  error?: { message?: unknown }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function generateWithDashScope(prompt: string, options: ImageGenerationOptions): Promise<string> {
  const endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${options.apiKey}`,
    'X-DashScope-Async': 'enable',
  }

  const created = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model || 'wanx2.1-t2i-turbo',
      input: { prompt },
      parameters: { size: '1024*1024', n: 1 },
    }),
  })

  const createdPayload = await created.json() as TaskResponse
  const taskId = createdPayload.output?.task_id
  if (!created.ok || !taskId)
    throw new Error(createdPayload.message ?? 'The image task was not created')

  for (let attempt = 0; attempt < 45; attempt++) {
    await sleep(2000)

    const polled = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${options.apiKey}` },
    })
    const payload = await polled.json() as TaskResponse
    const status = payload.output?.task_status

    if (status === 'SUCCEEDED') {
      const url = payload.output?.results?.[0]?.url
      if (url)
        return url
      throw new Error('The image task finished without a result')
    }

    if (status === 'FAILED')
      throw new Error(payload.output?.message ?? 'The image task failed')
  }

  throw new Error('The image task timed out')
}

async function generateWithOpenAI(prompt: string, options: ImageGenerationOptions): Promise<string> {
  const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    }),
  })

  const payload = await response.json() as ImagesResponse

  if (!response.ok) {
    const message = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
    throw new Error(message)
  }

  const first = payload.data?.[0]
  if (first?.url)
    return first.url
  if (first?.b64_json)
    return `data:image/png;base64,${first.b64_json}`

  throw new Error('The image provider returned no image')
}

/** Generates one image and returns a URL or data URL. */
export async function generateImage(prompt: string, options: ImageGenerationOptions): Promise<string> {
  if (options.baseUrl.includes('dashscope.aliyuncs.com'))
    return generateWithDashScope(prompt, options)

  return generateWithOpenAI(prompt, options)
}
