import type { ChatToolTrace } from './tools'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  /** Data URL of an attached or generated image. */
  image?: string
  /** Marks an image as a sticker, so the chat draws it small. */
  sticker?: boolean
  /** The tool calls this reply made, kept for the transcript. */
  toolCalls?: ChatToolTrace[]
}

export const chatMessagesKey = 'aipets:react:chat/messages'
export const chatModelKey = 'aipets:react:chat/model'
export const chatProviderKey = 'aipets:react:chat/provider'

export const characterNameKey = 'aipets:react:character/name'
export const characterPersonaKey = 'aipets:react:character/persona'

export const memoryEnabledKey = 'aipets:react:memory/enabled'
export const memoryWindowKey = 'aipets:react:memory/window'
