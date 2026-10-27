/**
 * In-memory record of every director model exchange.
 *
 * The monitor keeps the exact request body sent to the provider and the exact
 * response body it returned. Nothing is rebuilt from UI messages.
 */

export type DirectorMonitorStatus = 'pending' | 'done' | 'failed'

export interface DirectorMonitorExchange {
  id: number
  model: string
  characterName: string
  startedAt: number
  /** Exact JSON bodies sent to the provider, one per round. */
  requests: string[]
  status: DirectorMonitorStatus
  /** Exact response bodies, one per round. A stream keeps its SSE lines. */
  responses: string[]
  /** Assembled reply text, one per round, with the stream chunks merged. */
  replies: string[]
  /** Tool calls the model asked for in each round, formatted as name and args. */
  toolCalls: string[]
  /** Plan block the reply carried, exactly as the model wrote it. */
  plan: string | null
  /** What happened to the plan: applied, rejected, absent, or not requested. */
  planNote: string | null
  promptMs: number | null
  error: string | null
}

export interface DirectorMonitorStart {
  model: string
  characterName: string
}

export type DirectorMonitorListener = (exchanges: DirectorMonitorExchange[]) => void

class DirectorMonitorStore {
  private exchanges: DirectorMonitorExchange[] = []
  private listeners = new Set<DirectorMonitorListener>()
  private nextId = 1
  private readonly max = 10

  begin(input: DirectorMonitorStart): number {
    const id = this.nextId
    this.nextId += 1

    const exchange: DirectorMonitorExchange = {
      id,
      model: input.model,
      characterName: input.characterName,
      startedAt: Date.now(),
      requests: [],
      status: 'pending',
      responses: [],
      replies: [],
      toolCalls: [],
      plan: null,
      planNote: null,
      promptMs: null,
      error: null,
    }

    this.exchanges = [...this.exchanges, exchange].slice(-this.max)

    this.notify()
    return id
  }

  addRequest(id: number, request: string): void {
    this.update(id, exchange => ({ ...exchange, requests: [...exchange.requests, request] }))
  }

  addResponse(id: number, response: string): void {
    this.update(id, exchange => ({ ...exchange, responses: [...exchange.responses, response] }))
  }

  /** Stores the merged reply one round returned. Empty rounds stay listed. */
  addReply(id: number, content: string, toolCalls: string): void {
    this.update(id, exchange => ({
      ...exchange,
      replies: [...exchange.replies, content],
      toolCalls: [...exchange.toolCalls, toolCalls],
    }))
  }

  setPlan(id: number, plan: string | null, planNote: string): void {
    this.update(id, exchange => ({ ...exchange, plan, planNote }))
  }

  complete(id: number, promptMs: number): void {
    this.update(id, exchange => ({ ...exchange, status: 'done', promptMs }))
  }

  fail(id: number, error: string): void {
    this.update(id, exchange => ({ ...exchange, status: 'failed', error }))
  }

  snapshot(): DirectorMonitorExchange[] {
    return [...this.exchanges]
  }

  clear(): void {
    this.exchanges = []
    this.notify()
  }

  subscribe(listener: DirectorMonitorListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(id: number, patch: (exchange: DirectorMonitorExchange) => DirectorMonitorExchange): void {
    this.exchanges = this.exchanges.map(exchange => (exchange.id === id ? patch(exchange) : exchange))
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners)
      listener(this.snapshot())
  }
}

export const directorMonitor = new DirectorMonitorStore()
