import type { ChatMessage } from './types'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export const chatSessionsKey = 'airi:react:chat/sessions'
export const chatActiveSessionKey = 'airi:react:chat/active-session'
const legacyMessagesKey = 'airi:react:chat/messages'

export function createSession(): ChatSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: '',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

export function sessionTitle(session: ChatSession, fallback: string): string {
  if (session.title)
    return session.title

  const firstUser = session.messages.find(message => message.role === 'user')
  if (!firstUser)
    return fallback

  return firstUser.content.slice(0, 24)
}

/** Moves the flat message list from the first chat version into one session. */
export function migrateLegacyMessages(sessions: ChatSession[]): ChatSession[] {
  if (sessions.length > 0)
    return sessions

  try {
    const raw = localStorage.getItem(legacyMessagesKey)
    if (!raw)
      return sessions

    const messages = JSON.parse(raw) as ChatMessage[]
    if (!Array.isArray(messages) || messages.length === 0)
      return sessions

    const session = createSession()
    session.messages = messages
    session.updatedAt = messages[messages.length - 1]?.createdAt ?? session.updatedAt

    localStorage.removeItem(legacyMessagesKey)
    return [session]
  }
  catch {
    return sessions
  }
}
