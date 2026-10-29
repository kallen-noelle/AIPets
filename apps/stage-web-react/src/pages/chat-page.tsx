import { useEffect } from 'react'

import { ChatPanel } from '../components/chat-panel'
import { receiveDirectorContext, relayDirectorToPetWindow } from '../desktop/pet-relay'

export function ChatPage() {
  // The chat opens in its own desktop window. It must forward its animation
  // signals to the pet window, which owns the character. It also needs the
  // pet window director context, or the reply has no plan block.
  useEffect(() => {
    const stopContext = receiveDirectorContext()
    const stopRelay = relayDirectorToPetWindow()

    return () => {
      stopContext()
      stopRelay()
    }
  }, [])

  return <ChatPanel variant="page" />
}
