import type { DirectorMonitorExchange } from '../animation/director-monitor'

import { useEffect, useState } from 'react'

import { directorMonitor } from '../animation/director-monitor'

const statusClass: Record<DirectorMonitorExchange['status'], string> = {
  pending: 'text-amber-400',
  done: 'text-emerald-400',
  failed: 'text-rose-400',
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString()
}

/** Requests are JSON. Responses can be SSE text, which stays as it arrived. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  }
  catch {
    return text
  }
}

/**
 * Debug panel for the director model exchange.
 *
 * Shows the exact request body sent to the provider and the exact response
 * body it returned. Data stays in memory only.
 */
export function DirectorMonitorPanel() {
  const [exchanges, setExchanges] = useState<DirectorMonitorExchange[]>(() => directorMonitor.snapshot())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => directorMonitor.subscribe(setExchanges), [])

  const selected = exchanges.find(exchange => exchange.id === selectedId)
    ?? exchanges[exchanges.length - 1]
    ?? null

  return (
    <details
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
      className={[
        'w-full max-w-xl rounded-2xl border p-4 text-sm',
        'border-[var(--airi-border)] bg-[var(--airi-card)]/80',
      ].join(' ')}
    >
      <summary className="cursor-pointer text-[var(--airi-muted)]">
        Model monitor
        {' · '}
        {exchanges.length}
        {' '}
        exchanges
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={[
              'rounded-full px-3 py-1 text-xs transition',
              'bg-[var(--airi-card)] text-[var(--airi-fg)] hover:bg-[var(--airi-hover)]',
            ].join(' ')}
            onClick={() => {
              directorMonitor.clear()
              setExchanges([])
              setSelectedId(null)
            }}
          >
            Clear monitor
          </button>

          {[...exchanges].reverse().map(exchange => (
            <button
              key={exchange.id}
              type="button"
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-mono transition',
                selected?.id === exchange.id
                  ? 'bg-[var(--airi-hover)] text-[var(--airi-fg)]'
                  : 'bg-[var(--airi-bg)] text-[var(--airi-muted)] hover:text-[var(--airi-fg)]',
              ].join(' ')}
              onClick={() => setSelectedId(exchange.id)}
            >
              #
              {exchange.id}
              {' '}
              <span className={statusClass[exchange.status]}>{exchange.status}</span>
              {exchange.promptMs !== null ? ` ${(exchange.promptMs / 1000).toFixed(1)}s` : ''}
            </button>
          ))}
        </div>

        {!selected
          ? <p className="text-xs text-[var(--airi-muted)]">No model requests yet. Send a chat message to capture one.</p>
          : (
              <div className="flex flex-col gap-2 text-xs font-mono">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--airi-muted)]">
                  <span className={statusClass[selected.status]}>{selected.status}</span>
                  <span>{formatTime(selected.startedAt)}</span>
                  <span>{selected.characterName}</span>
                  <span>{selected.model}</span>
                  {selected.promptMs !== null && (
                    <span>
                      {selected.promptMs}
                      ms
                    </span>
                  )}
                </div>

                {selected.error && (
                  <p className="text-rose-400">{selected.error}</p>
                )}

                <p className="text-[var(--airi-muted)]">Plan</p>
                <p className="break-words">{selected.planNote ?? 'Waiting for the reply…'}</p>
                {selected.plan && (
                  <details open>
                    <summary className="cursor-pointer text-[var(--airi-fg)]">
                      plan body
                      {' · '}
                      {selected.plan.length}
                      {' '}
                      chars
                    </summary>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--airi-bg)] p-2">
                      {prettyJson(selected.plan)}
                    </pre>
                  </details>
                )}

                <p className="text-[var(--airi-muted)]">Merged reply</p>
                {selected.replies.length === 0
                  ? <p className="text-[var(--airi-muted)]">{selected.status === 'pending' ? 'Waiting for the model…' : '(empty)'}</p>
                  : selected.replies.map((reply, index) => (
                      <details key={`reply-${index}`} open={index === selected.replies.length - 1}>
                        <summary className="cursor-pointer text-[var(--airi-fg)]">
                          round
                          {' '}
                          {index + 1}
                          {' · '}
                          {reply.length}
                          {' '}
                          chars
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--airi-bg)] p-2">
                          {reply || '(empty)'}
                        </pre>
                        {selected.toolCalls[index] && (
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--airi-bg)] p-2 text-[var(--airi-muted)]">
                            {selected.toolCalls[index]}
                          </pre>
                        )}
                      </details>
                    ))}

                <p className="text-[var(--airi-muted)]">Request body</p>
                {selected.requests.length === 0
                  ? <p className="text-[var(--airi-muted)]">Waiting for the request…</p>
                  : selected.requests.map((request, index) => (
                      <details key={`request-${index}`} open={index === selected.requests.length - 1}>
                        <summary className="cursor-pointer text-[var(--airi-fg)]">
                          round
                          {' '}
                          {index + 1}
                          {' · '}
                          {request.length}
                          {' '}
                          chars
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--airi-bg)] p-2">
                          {prettyJson(request)}
                        </pre>
                      </details>
                    ))}

                <p className="text-[var(--airi-muted)]">Response body</p>
                {selected.responses.length === 0
                  ? <p className="text-[var(--airi-muted)]">{selected.status === 'pending' ? 'Waiting for the model…' : '(empty)'}</p>
                  : selected.responses.map((response, index) => (
                      <details key={`response-${index}`} open={index === selected.responses.length - 1}>
                        <summary className="cursor-pointer text-[var(--airi-fg)]">
                          round
                          {' '}
                          {index + 1}
                          {' · '}
                          {response.length}
                          {' '}
                          chars
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--airi-bg)] p-2">
                          {prettyJson(response)}
                        </pre>
                      </details>
                    ))}
              </div>
            )}
      </div>
    </details>
  )
}
