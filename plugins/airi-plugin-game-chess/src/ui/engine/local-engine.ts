import type { AiEngine, EngineMove } from './types'

import { Chess } from 'chess.js'

const pieceValues: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

/**
 * Creates a small built-in engine used when the WASM engine cannot start.
 *
 * It plays the black side with a one-ply material search, so the match stays
 * playable without any external engine asset.
 */
export function createLocalEngine(): AiEngine {
  return {
    kind: 'built-in',
    async bestMove(fen: string): Promise<EngineMove | null> {
      const game = new Chess(fen)
      const moves = game.moves({ verbose: true })
      const [first] = moves
      if (!first) {
        return null
      }

      let best = first
      let bestScore = Number.NEGATIVE_INFINITY

      for (const move of moves) {
        const next = new Chess(fen)
        next.move(move.promotion
          ? { from: move.from, to: move.to, promotion: move.promotion }
          : { from: move.from, to: move.to })

        // A tiny random tiebreak keeps repeated games from following one line.
        const score = evaluateForBlack(next) + Math.random() * 0.1
        if (score > bestScore) {
          bestScore = score
          best = move
        }
      }

      return {
        from: best.from,
        to: best.to,
        promotion: best.promotion,
      }
    },
    dispose() {},
  }
}

function evaluateForBlack(game: Chess): number {
  let score = 0

  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) {
        continue
      }

      const value = pieceValues[piece.type] ?? 0
      score += piece.color === 'b' ? value : -value
    }
  }

  return score
}
