export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  /** Data URL of an attached or generated image. */
  image?: string
}

export const chatMessagesKey = 'airi:react:chat/messages'
export const chatModelKey = 'airi:react:chat/model'
export const chatProviderKey = 'airi:react:chat/provider'

export const characterNameKey = 'airi:react:character/name'
export const characterPersonaKey = 'airi:react:character/persona'

export const memoryEnabledKey = 'airi:react:memory/enabled'
export const memoryWindowKey = 'airi:react:memory/window'
