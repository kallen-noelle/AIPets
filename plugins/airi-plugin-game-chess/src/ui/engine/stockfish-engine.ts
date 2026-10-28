import type { Square } from 'chess.js'

import type { AiEngine, EngineMove } from './types'

import stockfishScriptUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'
import stockfishWasmUrl from 'stockfish/bin/stockfish-18-lite-single.wasm?url'

const handshakeTimeoutMs = 20_000
const moveTimeoutMs = 20_000
const bestMovePattern = /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/

type LineHandler = (line: string) => void

/**
 * Stockfish WASM engine running inside a dedicated worker.
 *
 * The worker script reads the WASM location from its own URL hash, so the host
 * page must pass an absolute WASM URL after the `#` fragment.
 */
export class StockfishEngine implements AiEngine {
  readonly kind = 'stockfish'

  private readonly handlers = new Set<LineHandler>()
  private readonly worker: Worker
  private disposed = false

  private constructor(worker: Worker) {
    this.worker = worker
    worker.addEventListener('message', (event) => {
      const line = typeof event.data === 'string' ? event.data : String(event.data)
      for (const handler of this.handlers) {
        handler(line)
      }
    })
  }

  static async create(): Promise<StockfishEngine> {
    const scriptUrl = new URL(stockfishScriptUrl, import.meta.url).toString()
    const wasmUrl = new URL(stockfishWasmUrl, import.meta.url).toString()
    const worker = new Worker(`${scriptUrl}#${encodeURIComponent(wasmUrl)}`)
    const engine = new StockfishEngine(worker)

    try {
      await engine.handshake()
      return engine
    }
    catch (error) {
      engine.dispose()
      throw error
    }
  }

  async bestMove(fen: string, depth: number): Promise<EngineMove | null> {
    if (this.disposed) {
      return null
    }

    const bestLine = await this.waitForLine(
      line => line.startsWith('bestmove'),
      () => {
        this.send(`position fen ${fen}`)
        this.send(`go depth ${depth}`)
      },
      moveTimeoutMs,
    )

    return parseBestMove(bestLine)
  }

  dispose() {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.handlers.clear()
    this.worker.terminate()
  }

  private async handshake() {
    await this.waitForLine(line => line.trim() === 'uciok', () => this.send('uci'), handshakeTimeoutMs)
    await this.waitForLine(line => line.trim() === 'readyok', () => this.send('isready'), handshakeTimeoutMs)
  }

  private send(command: string) {
    this.worker.postMessage(command)
  }

  private waitForLine(
    matches: (line: string) => boolean,
    start: () => void,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined

      const handler: LineHandler = (line) => {
        if (!matches(line)) {
          return
        }

        clearTimeout(timer)
        this.handlers.delete(handler)
        resolve(line)
      }

      timer = setTimeout(() => {
        this.handlers.delete(handler)
        reject(new Error('Stockfish did not answer in time.'))
      }, timeoutMs)

      this.handlers.add(handler)
      start()
    })
  }
}

function parseBestMove(line: string): EngineMove | null {
  const match = bestMovePattern.exec(line.trim())
  if (!match) {
    return null
  }

  const [from, to, promotion] = [match[1], match[2], match[3]]
  if (!from || !to) {
    return null
  }

  return {
    from: from as Square,
    to: to as Square,
    promotion,
  }
}
