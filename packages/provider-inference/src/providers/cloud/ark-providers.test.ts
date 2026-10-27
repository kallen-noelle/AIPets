import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'zod/v4/core'

import { providerBytePlus } from './byteplus'

const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn((apiKey: string, baseURL: string) => ({
    apiKey,
    baseURL,
    chat: vi.fn((model: string) => ({ apiKey, baseURL, model })),
  })),
}))

vi.mock('@xsai-ext/providers/create', () => ({
  createOpenAI: createOpenAIMock,
}))

describe('ark chat provider definitions', () => {
  beforeEach(() => {
    vi.resetModules()
    createOpenAIMock.mockClear()
  })

  it('lists prefixed models and strips the prefix before chat requests', async () => {
    const byteplusConfig = parse(await providerBytePlus.createProviderConfig({ t: input => input }), { apiKey: 'test-key' })

    expect(byteplusConfig.baseUrl).toBe('https://ark.ap-southeast.bytepluses.com/api/v3')

    const providerInstance = await providerBytePlus.createProvider(byteplusConfig)
    if (!('chat' in providerInstance) || !providerInstance.chat)
      throw new Error('BytePlus provider must support chat')
    const chatConfig = providerInstance.chat('byteplus/seed-2-0-pro-260328')
    expect(chatConfig.model).toBe('seed-2-0-pro-260328')

    const byteplusModels = await providerBytePlus.extraMethods!.listModels!(byteplusConfig, providerInstance)

    expect(byteplusModels.map(model => model.id)).toEqual([
      'byteplus/seed-2-0-pro-260328',
      'byteplus/seed-2-0-lite-260228',
      'byteplus/seed-2-0-mini-260215',
      'byteplus/kimi-k2-5-260127',
      'byteplus/glm-4-7-251222',
    ])
  })
})
