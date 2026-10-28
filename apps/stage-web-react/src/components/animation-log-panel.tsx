import type { MouseEvent as ReactMouseEvent } from 'react'

import type { AnimationLogEntry } from '../animation/animation-log'

import { useEffect, useState } from 'react'

import { animationLog } from '../animation/animation-log'

const phaseColors: Record<string, string> = {
  chat: 'text-sky-400',
  director: 'text-violet-400',
  bus: 'text-amber-400',
  plan: 'text-emerald-400',
  executor: 'text-teal-400',
  dispatch: 'text-rose-400',
  stage: 'text-orange-400',
  affect: 'text-pink-400',
}

function phaseClass(phase: string): string {
  return phaseColors[phase] ?? 'text-[var(--aipets-muted)]'
}

function formatTime(t: number): string {
  return `${(t / 1000).toFixed(2)}s`
}

function detailText(detail: unknown): string | null {
  if (detail === undefined || detail === null)
    return null
  try {
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)
    return text.length > 500 ? `${text.slice(0, 500)}…` : text
  }
  catch {
    return String(detail)
  }
}

function detailRaw(detail: unknown): string {
  if (detail === undefined || detail === null)
    return ''
  try {
    return typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)
  }
  catch {
    return String(detail)
  }
}

const MAX_VISIBLE = 30

/**
 * Debug panel for the animation pipeline.
 *
 * Shows every stage from the chat panel to the video element. A missing phase
 * points at the exact break. Logs stay in memory only; UI caps display at 30.
 */
export function AnimationLogPanel() {
  const [entries, setEntries] = useState<AnimationLogEntry[]>(() => animationLog.snapshot())
  const [expanded, setExpanded] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    return animationLog.subscribe(() => {
      setEntries(animationLog.snapshot())
    })
  }, [])

  const visible = entries.slice(-MAX_VISIBLE)

  return (
    <details
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
      className={[
        'w-full max-w-xl rounded-2xl border p-4 text-sm',
        'border-[var(--aipets-border)] bg-[var(--aipets-card)]/80',
      ].join(' ')}
    >
      <summary className="cursor-pointer text-[var(--aipets-muted)]">
        Animation playback log
        {' · '}
        {entries.length}
        {' '}
        total
        {' · showing latest '}
        {visible.length}
      </summary>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={[
              'rounded-full px-3 py-1 text-xs transition',
              'bg-[var(--aipets-card)] text-[var(--aipets-fg)] hover:bg-[var(--aipets-hover)]',
            ].join(' ')}
            onClick={() => {
              animationLog.clear()
              setEntries([])
            }}
          >
            Clear log
          </button>
        </div>

        {visible.length === 0
          ? <p className="text-xs text-[var(--aipets-muted)]">No entries yet. Send a chat message to trace the pipeline.</p>
          : (
              <ol className="max-h-72 flex flex-col gap-1 overflow-y-auto text-xs font-mono">
                {visible.map((entry, index) => {
                  const detail = detailText(entry.detail)
                  const raw = detailRaw(entry.detail)
                  const isExpanded = expanded === index
                  const isCopied = copiedIndex === index
                  const copyDetail = async (event: ReactMouseEvent) => {
                    event.stopPropagation()
                    const text = raw
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text)
                      }
                      else {
                        // Fallback for non-secure contexts (http:// file://)
                        const textarea = document.createElement('textarea')
                        textarea.value = text
                        textarea.style.position = 'fixed'
                        textarea.style.opacity = '0'
                        document.body.appendChild(textarea)
                        textarea.select()
                        document.execCommand('copy')
                        document.body.removeChild(textarea)
                      }
                      setCopiedIndex(index)
                      window.setTimeout(setCopiedIndex, 1200, null as number | null)
                    }
                    catch (error) {
                      console.warn('[animation-log] copy failed', error)
                    }
                  }
                  return (
                    <li key={`${entry.phase}-${entry.t}-${index}`} className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        className="flex items-start gap-2 text-left"
                        onClick={() => setExpanded(isExpanded ? null : index)}
                      >
                        <span className="shrink-0 text-[var(--aipets-muted)]">{formatTime(entry.t)}</span>
                        <span className={`shrink-0 ${phaseClass(entry.phase)}`}>{entry.phase.padEnd(9, ' ')}</span>
                        <span className="text-[var(--aipets-fg)]">{entry.message}</span>
                      </button>
                      {detail && (
                        <div className="ml-16 flex items-start gap-2">
                          <pre
                            className={[
                              'flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--aipets-bg)] p-1.5',
                              isExpanded ? '' : 'max-h-8 overflow-hidden opacity-60',
                            ].join(' ')}
                          >
                            {detail}
                          </pre>
                          <button
                            type="button"
                            onClick={copyDetail}
                            className={[
                              'shrink-0 rounded px-2 py-0.5 text-[10px] transition',
                              isCopied
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-[var(--aipets-card)] text-[var(--aipets-muted)] hover:text-[var(--aipets-fg)]',
                            ].join(' ')}
                            title="Copy full detail"
                          >
                            {isCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
      </div>
    </details>
  )
}
