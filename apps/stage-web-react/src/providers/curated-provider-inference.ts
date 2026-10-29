/**
 * Curated re-exports from @proj-aipets/provider-inference.
 *
 * The barrel index.ts of provider-inference also re-exports Sherpaw local
 * transcription which pulls a 13.8 MB WASM into web builds. This local
 * barrel re-exports only what the React frontend needs, so Vite never
 * evaluates the Sherpaw path.
 */

export { portableProviderDefinitions } from '../../../../packages/provider-inference/src/providers/index'
export type { InferenceServiceProvider, ProviderDefinition } from '../../../../packages/provider-inference/src/types'
