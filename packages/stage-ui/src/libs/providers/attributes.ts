/** Pricing category used by provider catalogue filters. */
export type ProviderPricing = 'free' | 'paid'

/** Deployment category used by provider catalogue filters. */
export type ProviderDeployment = 'local' | 'cloud'

/**
 * Represents catalogue attributes used by provider filtering UI.
 */
export interface ProviderAttributes {
  /** Price bucket shown by the provider source filter. */
  pricing?: ProviderPricing
  /** Runtime/deployment bucket shown by the provider source filter. */
  deployment?: ProviderDeployment
  /** Whether the provider should receive the existing recommended tag. */
  beginnerRecommended?: boolean
}

/** Minimal provider identity accepted by the attribute resolver. */
export interface ProviderAttributesInput {
  id?: string
}

const paidCloud = {
  pricing: 'paid',
  deployment: 'cloud',
} satisfies ProviderAttributes

const freeLocal = {
  pricing: 'free',
  deployment: 'local',
} satisfies ProviderAttributes

const recommendedPaidCloud = {
  ...paidCloud,
  beginnerRecommended: true,
} satisfies ProviderAttributes

const providerAttributesById = {
  'alibaba-cloud-model-studio': paidCloud,
  'aliyun-nls-transcription': paidCloud,
  'anthropic': paidCloud,
  'app-local-audio-speech': freeLocal,
  'app-local-audio-transcription': freeLocal,
  'apple-vision': freeLocal,
  'browser-local-audio-speech': freeLocal,
  'browser-local-audio-transcription': freeLocal,
  'browser-web-speech-api': freeLocal,
  'byteplus': paidCloud,
  'deepseek': paidCloud,
  'google-generative-ai': paidCloud,
  'kokoro-local': freeLocal,
  'lm-studio': freeLocal,
  'moonshot-ai': paidCloud,
  'nvidia': paidCloud,
  'official-provider': recommendedPaidCloud,
  'official-provider-speech': recommendedPaidCloud,
  'official-provider-speech-streaming': recommendedPaidCloud,
  'ollama': freeLocal,
  'openai': paidCloud,
  'openai-audio-speech': paidCloud,
  'openai-audio-transcription': paidCloud,
  'openai-compatible': false,
  'openai-compatible-audio-speech': false,
  'openai-compatible-audio-transcription': false,
  'speech-noop': false,
  'volcengine': paidCloud,
  'zai': paidCloud,
} satisfies Record<string, ProviderAttributes | false>

/**
 * Normalizes provider attributes by dropping undefined fields.
 *
 * Before:
 * - `{ pricing: "paid", deployment: undefined }`
 *
 * After:
 * - `{ pricing: "paid" }`
 */
function compactProviderAttributes(metadata: ProviderAttributes): ProviderAttributes {
  return {
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    ...(metadata.deployment ? { deployment: metadata.deployment } : {}),
    ...(metadata.beginnerRecommended !== undefined ? { beginnerRecommended: metadata.beginnerRecommended } : {}),
  }
}

/**
 * Resolves the provider attributes used by settings filters.
 *
 * Use when:
 * - Rendering provider source cards.
 * - Selecting serializable metadata from a provider definition.
 *
 * Expects:
 * - `metadata.id` may identify a provider with catalogue metadata.
 *
 * Returns:
 * - Compact metadata with only meaningful tag fields.
 */
export function resolveProviderAttributes(
  metadata: ProviderAttributesInput = {},
): ProviderAttributes {
  if (!metadata.id)
    return {}

  const attributes = providerAttributesById[metadata.id as keyof typeof providerAttributesById]
  if (attributes === false)
    return {}
  if (attributes)
    return compactProviderAttributes(attributes)

  return {}
}
