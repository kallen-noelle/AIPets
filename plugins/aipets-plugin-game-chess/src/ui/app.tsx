import type { Color, Square } from 'chess.js'

import type { AiEngine } from './engine/types'

import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createLocalEngine } from './engine/local-engine'
import { StockfishEngine } from './engine/stockfish-engine'

type GameMode = 'aipets' | 'local'
type GamePhase = 'setup' | 'playing'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const
const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const humanColor: Color = 'w'
const aipetsColor: Color = 'b'
const difficultyOptions = [
  { label: 'Easy', depth: 2 },
  { label: 'Normal', depth: 5 },
  { label: 'Hard', depth: 9 },
] as const

const pieceGlyphs: Record<string, string> = {
  wK: '♔',
  wQ: '♕',
  wR: '♖',
  wB: '♗',
  wN: '♘',
  wP: '♙',
  bK: '♚',
  bQ: '♛',
  bR: '♜',
  bB: '♝',
  bN: '♞',
  bP: '♟',
}

export function App() {
  const [fen, setFen] = useState(startingFen)
  const [mode, setMode] = useState<GameMode>('aipets')
  const [difficulty, setDifficulty] = useState<number>(difficultyOptions[1].depth)
  const [phase, setPhase] = useState<GamePhase>('setup')
  const [selected, setSelected] = useState<Square | null>(null)
  const [legalTargets, setLegalTargets] = useState<readonly Square[]>([])
  const [history, setHistory] = useState<readonly string[]>([])
  const [status, setStatus] = useState('Choose a mode, then start the match.')
  const [thinking, setThinking] = useState(false)
  const [engineLabel, setEngineLabel] = useState('Engine: starting')

  const engineRef = useRef<AiEngine | null>(null)
  const aiBusyRef = useRef(false)
  const position = useMemo(() => new Chess(fen), [fen])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const engine = await StockfishEngine.create()
        if (cancelled) {
          engine.dispose()
          return
        }

        engineRef.current = engine
        setEngineLabel('Engine: Stockfish')
      }
      catch {
        if (cancelled) {
          return
        }

        engineRef.current = createLocalEngine()
        setEngineLabel('Engine: built-in')
      }
    })()

    return () => {
      cancelled = true
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (phase !== 'playing' || mode !== 'aipets' || aiBusyRef.current) {
      return
    }

    const game = new Chess(fen)
    if (game.isGameOver() || game.turn() !== aipetsColor || !engineRef.current) {
      return
    }

    const engine = engineRef.current
    aiBusyRef.current = true
    let cancelled = false
    setThinking(true)

    void (async () => {
      const move = await engine.bestMove(fen, difficulty).catch(() => null)
      if (cancelled) {
        return
      }

      aiBusyRef.current = false
      setThinking(false)

      if (!move) {
        setStatus('AIPETS has no move.')
        return
      }

      const next = new Chess(fen)
      const target = next.moves({ verbose: true }).find(candidate =>
        candidate.from === move.from
        && candidate.to === move.to
        && (candidate.promotion == null || candidate.promotion === (move.promotion ?? 'q')),
      )
      if (!target) {
        setStatus('AIPETS returned an illegal move.')
        return
      }

      const applied = target.promotion
        ? next.move({ from: target.from, to: target.to, promotion: target.promotion })
        : next.move({ from: target.from, to: target.to })

      setFen(next.fen())
      setHistory(previous => [...previous, applied.san])
      setStatus(describeStatus(next, 'aipets'))
    })()

    return () => {
      cancelled = true
      aiBusyRef.current = false
    }
  }, [difficulty, engineLabel, fen, mode, phase])

  const handleStart = useCallback(() => {
    setFen(startingFen)
    setHistory([])
    setSelected(null)
    setLegalTargets([])
    setThinking(false)
    setPhase('playing')
    setStatus(mode === 'aipets' ? 'Your move.' : 'White to move.')
  }, [mode])

  const handleReset = useCallback(() => {
    setFen(startingFen)
    setHistory([])
    setSelected(null)
    setLegalTargets([])
    setThinking(false)
    setPhase('setup')
    setStatus('Choose a mode, then start the match.')
  }, [])

  const handleSquareClick = useCallback((square: Square) => {
    if (phase !== 'playing') {
      return
    }

    const game = new Chess(fen)
    if (game.isGameOver() || (mode === 'aipets' && game.turn() !== humanColor)) {
      return
    }

    if (selected && legalTargets.includes(square)) {
      const target = game.moves({ verbose: true }).find(candidate =>
        candidate.from === selected && candidate.to === square,
      )
      if (!target) {
        return
      }

      const applied = target.promotion
        ? game.move({ from: target.from, to: target.to, promotion: target.promotion })
        : game.move({ from: target.from, to: target.to })

      setFen(game.fen())
      setHistory(previous => [...previous, applied.san])
      setSelected(null)
      setLegalTargets([])
      setStatus(describeStatus(game, mode))
      return
    }

    const piece = game.get(square)
    if (!piece || piece.color !== game.turn()) {
      setSelected(null)
      setLegalTargets([])
      return
    }

    setSelected(square)
    setLegalTargets(game.moves({ square, verbose: true }).map(move => move.to))
  }, [fen, legalTargets, mode, phase, selected])

  const board = position.board()

  return (
    <div className="chess-app">
      {phase === 'setup'
        ? (
            <section className="chess-setup">
              <h1>Match Setup</h1>
              <p className="chess-hint">Pick a mode and start the match. You play White.</p>

              <fieldset className="chess-fieldset">
                <legend>Mode</legend>
                <label className="chess-option">
                  <input
                    checked={mode === 'aipets'}
                    name="chess-mode"
                    type="radio"
                    value="aipets"
                    onChange={() => setMode('aipets')}
                  />
                  <span>Vs AIPETS</span>
                </label>
                <label className="chess-option">
                  <input
                    checked={mode === 'local'}
                    name="chess-mode"
                    type="radio"
                    value="local"
                    onChange={() => setMode('local')}
                  />
                  <span>Two Players</span>
                </label>
              </fieldset>

              <label className="chess-option">
                <span>Difficulty</span>
                <select
                  disabled={mode !== 'aipets'}
                  value={difficulty}
                  onChange={event => setDifficulty(Number(event.target.value))}
                >
                  {difficultyOptions.map(option => (
                    <option key={option.label} value={option.depth}>{option.label}</option>
                  ))}
                </select>
              </label>

              <button className="chess-primary" type="button" onClick={handleStart}>Start Game</button>
            </section>
          )
        : null}

      <section className="chess-board-panel">
        <div className="chess-status" aria-live="polite">
          <strong>{status}</strong>
          <span>{engineLabel}</span>
        </div>

        <div aria-label="Chess board" className="chess-board" role="grid">
          {board.map((row, rowIndex) =>
            row.map((piece, columnIndex) => {
              const square = `${files[columnIndex]}${ranks[rowIndex]}` as Square
              const isDark = (rowIndex + columnIndex) % 2 === 1
              const classes = ['chess-square', isDark ? 'chess-square-dark' : 'chess-square-light']

              if (selected === square) {
                classes.push('chess-square-selected')
              }
              if (legalTargets.includes(square)) {
                classes.push('chess-square-target')
              }

              return (
                <button
                  key={square}
                  className={classes.join(' ')}
                  title={square}
                  type="button"
                  onClick={() => handleSquareClick(square)}
                >
                  {piece ? pieceGlyphs[`${piece.color}${piece.type.toUpperCase()}`] : ''}
                </button>
              )
            }),
          )}
        </div>

        {phase === 'playing'
          ? (
              <div className="chess-actions">
                <span>{thinking ? 'AIPETS is thinking.' : '\u00A0'}</span>
                <button className="chess-secondary" type="button" onClick={handleReset}>New Game</button>
              </div>
            )
          : null}

        <ol className="chess-history">
          {history.map((move, index) => (
            <li key={`${index}-${move}`}>{move}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function describeStatus(game: Chess, mode: GameMode): string {
  if (game.isCheckmate()) {
    if (mode === 'local') {
      return 'Checkmate.'
    }

    return game.turn() === humanColor ? 'Checkmate. AIPETS wins.' : 'Checkmate. You win.'
  }

  if (game.isDraw() || game.isStalemate()) {
    return 'Draw.'
  }

  if (mode === 'local') {
    return `${game.turn() === 'w' ? 'White' : 'Black'} to move.`
  }

  if (game.turn() === humanColor) {
    return game.isCheck() ? 'Your move. You are in check.' : 'Your move.'
  }

  return game.isCheck() ? 'AIPETS is in check.' : 'AIPETS is thinking.'
}
