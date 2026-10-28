import { portableProviderDefinitions } from '@proj-airi/provider-inference'

/** The task groups the React settings show, and the provider task names each group covers. */
export const providerTaskAliases = {
  chat: ['chat'],
  speech: ['text-to-speech', 'tts'],
  transcription: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
} as const

export type ProviderTaskGroup = keyof typeof providerTaskAliases

/** Where the settings keep the active provider of each group. */
export const activeProviderKeys: Record<ProviderTaskGroup, string> = {
  chat: 'aipets:react:chat/provider',
  speech: 'aipets:react:speech/provider',
  transcription: 'settings/hearing/active-provider',
}

/** True when a provider definition covers a group. */
export function definitionHasTask(tasks: readonly string[] | undefined, group: ProviderTaskGroup): boolean {
  if (!tasks?.length)
    return false

  return tasks.some(task => (providerTaskAliases[group] as readonly string[]).includes(task))
}

/** The groups a provider definition covers. */
export function groupsOfDefinition(definitionId: string): ProviderTaskGroup[] {
  const definition = portableProviderDefinitions.find(item => item.id === definitionId)
  return (Object.keys(providerTaskAliases) as ProviderTaskGroup[])
    .filter(group => definitionHasTask(definition?.tasks, group))
}
