import type { ProviderDefinition } from '../types'

import { providerAnthropic } from './cloud/anthropic'
import { providerBytePlus } from './cloud/byteplus'
import { providerDeepSeek } from './cloud/deepseek'
import { providerGoogleGenerativeAI } from './cloud/google-generative-ai'
import { providerMoonshotAI } from './cloud/moonshot-ai'
import { providerOpenAI } from './cloud/openai'
import {
  providerOpenAIAudioSpeech,
  providerOpenAIAudioTranscription,
  providerOpenAICompatibleAudioSpeech,
  providerOpenAICompatibleAudioTranscription,
} from './cloud/openai-audio'
import { providerOpenAICompatible } from './cloud/openai-compatible'
import {
  providerAlibabaCloudModelStudio,
  providerVolcengineSpeech,
} from './cloud/unspeech'
import { providerZai } from './cloud/zai'
import { providerBrowserWebSpeechApi } from './local/browser-web-speech-api'
import { providerLmStudio } from './local/lm-studio'
import { providerOllama } from './local/ollama'
import { providerSpeechNoop } from './local/speech-noop'

/**
 * Erases configuration types at the registry boundary.
 *
 * A registry selects definitions by a runtime id. It cannot know the selected
 * configuration type. Individual provider exports preserve their exact type.
 */
type ProviderDefinitionRegistration<TId extends string = string> = Pick<ProviderDefinition, 'name' | 'order'> & { id: TId }

type ErasedProviderDefinitions<TDefinitions extends readonly ProviderDefinitionRegistration[]> = {
  [K in keyof TDefinitions]: TDefinitions[K] extends ProviderDefinitionRegistration<infer TId>
    ? ProviderDefinition<Record<string, unknown>, TId>
    : never
}

function eraseProviderDefinitions<const TDefinitions extends readonly ProviderDefinitionRegistration[]>(
  ...definitions: TDefinitions
): ErasedProviderDefinitions<TDefinitions> {
  return definitions as unknown as ErasedProviderDefinitions<TDefinitions>
}

/**
 * Definitions that can load without Vue, Pinia, persistence, or Electron.
 *
 * This list includes Browser-only definitions. Hosts must call
 * `isAvailableBy` before they offer one to a user in the current runtime.
 */
export const portableProviderDefinitions = eraseProviderDefinitions(
  providerAnthropic,
  providerBytePlus,
  providerDeepSeek,
  providerGoogleGenerativeAI,
  providerMoonshotAI,
  providerOpenAI,
  providerOpenAIAudioSpeech,
  providerOpenAIAudioTranscription,
  providerOpenAICompatibleAudioSpeech,
  providerOpenAICompatibleAudioTranscription,
  providerOpenAICompatible,
  providerAlibabaCloudModelStudio,
  providerVolcengineSpeech,
  providerZai,
  providerBrowserWebSpeechApi,
  providerLmStudio,
  providerOllama,
  providerSpeechNoop,
)

export { createProviderRegistry, defineProvider } from './registry'
