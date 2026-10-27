import type { ChatReasoningMode, GenerationProvider } from '@proj-airi/provider-inference'
import type { OpenRouterChatModelRuntimeConfig } from 'vieval/plugins/chat-models'

import { getDefinedProvider, getGenerationProvider, withReasoning } from '@proj-airi/provider-inference'

/**
 * Adapts the chat model that vieval selected to the provider interface of core-agent.
 *
 * It uses the OpenAI-compatible definition of AIRI with the endpoint of the eval model.
 */
export async function generationProviderFrom(config: OpenRouterChatModelRuntimeConfig, reasoning: ChatReasoningMode): Promise<GenerationProvider> {
  const definition = getDefinedProvider('openai-compatible')
  if (!definition)
    throw new Error('The provider registry has no OpenAI-compatible definition')

  const provider = getGenerationProvider(await definition.createProvider({ api: 'chat-completions', apiKey: config.apiKey, baseUrl: config.baseURL || undefined }))
  if (!provider)
    throw new Error('The OpenAI-compatible provider does not support generation')

  return withReasoning(provider, { reasoning })
}
