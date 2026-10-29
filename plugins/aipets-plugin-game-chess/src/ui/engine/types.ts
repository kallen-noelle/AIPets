import type { Square } from 'chess.js'

/** One engine answer expressed as a chess.js move. */
export interface EngineMove {
  from: Square
  to: Square
  promotion?: string
}

/** Minimal chess engine surface used by the game screen. */
export interface AiEngine {
  /** Short engine label shown in the status bar. */
  readonly kind: string
  /** Returns the best move for one FEN position. */
  bestMove: (fen: string, depth: number) => Promise<EngineMove | null>
  /** Releases engine resources. */
  dispose: () => void
}
