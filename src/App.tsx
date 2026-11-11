import { useCallback, useEffect, useMemo, useState } from 'react'
import { BoardPanel } from './components/BoardPanel'
import { EvalChart } from './components/EvalChart'
import { MoveList } from './components/MoveList'
import { AccuracyPanel } from './components/AccuracyPanel'
import { PgnInput } from './components/PgnInput'
import { useGameReview } from './hooks/useGameReview'
import { parsePgn } from './review/pgn'
import { SAMPLE_PGN } from './review/sample'
import { displayName } from './review/describeGame'
import type { MoveReview, ParsedGame } from './types'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Depth presets, ordered from fastest to strongest. */
const DEPTHS = [10, 12, 14, 16, 18]

/**
 * Top-level Game Review container.
 *
 * Owns the three things that must stay in sync:
 *  1. the parsed game (positions + moves),
 *  2. the board cursor (`ply`, 0..moves.length),
 *  3. the review produced by the analysis loop.
 *
 * Everything else is derived, so the board, chart and move list can never
 * disagree about which position is on screen.
 */
export default function GameReview() {
  // Start from the sample game so the app is useful on first paint.
  const [game, setGame] = useState<ParsedGame | null>(() => parsePgn(SAMPLE_PGN).game)
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [depth, setDepth] = useState(14)

  const { state, reviews, accuracy, retry, cancel } = useGameReview(game, { depth })

  const reviewsByPly = useMemo(() => {
    const map = new Map<number, MoveReview>()
    for (const item of reviews) map.set(item.ply, item)
    return map
  }, [reviews])

  const totalPlies = game?.moves.length ?? 0
  const fen = game ? game.positions[Math.min(ply, totalPlies)] : START_FEN
  const currentReview = ply > 0 ? reviewsByPly.get(ply - 1) ?? null : null

  const loadGame = useCallback((next: ParsedGame) => {
    setPly(0)
    setGame(next)
  }, [])

  const navigate = useCallback(
    (nextPly: number) => setPly(Math.min(Math.max(nextPly, 0), totalPlies)),
    [totalPlies],
  )

  // Keyboard navigation: arrows step through the game.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigate(ply + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigate(ply - 1)
      } else if (event.key === 'Home') {
        navigate(0)
      } else if (event.key === 'End') {
        navigate(totalPlies)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, ply, totalPlies])

  const whiteName = displayName(game?.headers.White, 'White')
  const blackName = displayName(game?.headers.Black, 'Black')
  const busy = state.phase === 'loading-engine' || state.phase === 'analyzing'

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden="true">
            ♞
          </span>
          <div>
            <h1>Game Review</h1>
            <p className="app__tagline">Local Stockfish WASM analysis · nothing leaves your browser</p>
          </div>
        </div>

        <div className="app__controls">
          <label className="depth">
            Depth
            <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
              {DEPTHS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          {busy ? (
            <button type="button" className="btn btn--ghost" onClick={cancel}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={retry} disabled={!retry}>
              Re-run
            </button>
          )}
        </div>
      </header>

      <StatusBar
        phase={state.phase}
        progress={state.progress}
        analysed={state.analysedPositions}
        total={state.totalPositions}
        engineLoad={state.engineLoad}
        error={state.error}
        onRetry={retry}
      />

      <main className="layout">
        <div className="layout__left">
          <BoardPanel
            game={game}
            fen={fen}
            lastMove={currentReview}
            currentReview={currentReview}
            orientation={orientation}
            onFlip={() => setOrientation((value) => (value === 'white' ? 'black' : 'white'))}
            onNavigate={navigate}
            totalPlies={totalPlies}
            ply={ply}
          />
        </div>

        <div className="layout__right">
          <EvalChart reviews={reviews} selectedPly={ply} onSelect={navigate} totalPlies={totalPlies} />

          {accuracy && (
            <AccuracyPanel
              white={accuracy.w}
              black={accuracy.b}
              whiteName={whiteName}
              blackName={blackName}
            />
          )}

          <MoveList reviews={reviews} selectedPly={ply} onSelect={navigate} />
        </div>

        <div className="layout__input">
          <PgnInput game={game} onGame={loadGame} />
        </div>
      </main>

      <footer className="app__footer">
        <span>
          Engine: Stockfish 19 Lite (single-threaded WASM) · Win chance{' '}
          <code>1 / (1 + 10^(-cp/400))</code>
        </span>
        <span>← → to navigate · Home/End to jump</span>
      </footer>
    </div>
  )
}

interface StatusBarProps {
  phase: ReturnType<typeof useGameReview>['state']['phase']
  progress: number
  analysed: number
  total: number
  engineLoad: number
  error: string | null
  onRetry?: () => void
}

function StatusBar({ phase, progress, analysed, total, engineLoad, error, onRetry }: StatusBarProps) {
  if (error) {
    return (
      <div className="status status--error" role="alert">
        <span>{error}</span>
        {onRetry && (
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    )
  }

  if (phase === 'loading-engine') {
    return (
      <div className="status">
        <span>Loading engine… {Math.round(engineLoad * 100)}%</span>
        <Progress value={engineLoad} />
      </div>
    )
  }

  if (phase === 'analyzing') {
    return (
      <div className="status">
        <span>
          Analyzing {analysed} / {total} positions
        </span>
        <Progress value={progress} />
      </div>
    )
  }

  if (phase === 'done') {
    return <div className="status status--done">Analysis complete · {analysed} positions</div>
  }

  return <div className="status status--idle">Ready</div>
}

function Progress({ value }: { value: number }) {
  return (
    <span
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="progress__fill" style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  )
}
