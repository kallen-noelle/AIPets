import { parsePullMessagesRequest, parseSendMessagesRequest } from '@proj-aipets/server-sdk-shared'
import { parseAuthenticateRequest, parseAuthenticateResponse } from '@proj-aipets/server-sdk-shared/v2'
import { describe, expect, it } from 'vitest'

describe('v1 chat WebSocket request contracts', () => {
  // https://gitee.com/kallen-noelle/AdoptAI/pull/2308#discussion_r3796624651
  // ROOT CAUSE:
  //
  // Eventa decodes the invoke envelope but does not validate its body. The
  // handlers used body fields directly, so malformed authenticated requests
  // reached ChatService.
  //
  // The shared protocol now owns the request schemas. The v1 handlers parse
  // every invoke body before logging or calling ChatService.
  it('rejects malformed send-messages requests', () => {
    expect(() => parseSendMessagesRequest({ chatId: 'chat-1', messages: [{ id: 'message-1', content: 'hello' }] }))
      .toThrow()
  })

  it('accepts a native reply relation in send-messages requests', () => {
    expect(parseSendMessagesRequest({
      chatId: 'chat-1',
      messages: [{
        id: 'message-2',
        role: 'user',
        content: 'My follow-up',
        replyToMessageId: 'message-1',
      }],
    })).toEqual({
      chatId: 'chat-1',
      messages: [{
        id: 'message-2',
        role: 'user',
        content: 'My follow-up',
        replyToMessageId: 'message-1',
      }],
    })
  })

  it('rejects malformed pull-messages requests', () => {
    expect(() => parsePullMessagesRequest({ chatId: 'chat-1', afterSeq: -1 }))
      .toThrow()
  })

  // https://gitee.com/kallen-noelle/AdoptAI/pull/2309#discussion_r3796726614
  it('rejects malformed authenticate requests from the shared contract', () => {
    expect(() => parseAuthenticateRequest({ token: '' })).toThrow()
    expect(() => parseAuthenticateRequest({ token: 'a'.repeat(4097) })).toThrow()
  })

  it('rejects malformed authenticate responses from the shared contract', () => {
    expect(() => parseAuthenticateResponse({ userId: '' })).toThrow()
  })
})
