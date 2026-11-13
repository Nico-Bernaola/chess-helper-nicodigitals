import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ eval: true })

  const toggleSection = useCallback((id: string) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }))
  }, [])

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
    <div className="mx-auto flex min-h-screen max-w-[1380px] flex-col gap-[18px] px-[clamp(16px,3vw,32px)] pt-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="grid size-12 place-items-center rounded-[14px] border border-[#33452a] bg-gradient-to-br from-[#2a3a23] to-[#17211a] text-[26px] text-accent" aria-hidden="true">
            ♞
          </span>
          <div>
            <h1 className="text-[22px] tracking-[-0.02em]">Game Review</h1>
            <p className="mt-0.5 text-[13px] text-text-muted">Local Stockfish WASM analysis · nothing leaves your browser</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 text-[13px] text-text-muted">
            Depth
            <select className="cursor-pointer rounded-lg border border-border bg-bg-elevated px-2.5 py-[7px] font-[inherit] text-text disabled:cursor-not-allowed disabled:opacity-50" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
              {DEPTHS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          {busy ? (
            <button type="button" className="btn bg-transparent" onClick={cancel}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn bg-transparent" onClick={retry} disabled={!retry}>
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

      <main className="grid grid-cols-1 [grid-template-areas:'board'_'side'_'input'] items-start gap-[18px] min-[981px]:grid-cols-[minmax(320px,520px)_minmax(0,1fr)] min-[981px]:[grid-template-areas:'board_side'_'input_input']">
        <div className="[grid-area:board]">
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

        <div className="min-w-0 self-stretch [grid-area:side] min-[981px]:relative" id="right-panel">
          <div className="flex min-w-0 flex-col gap-3.5 min-[981px]:absolute min-[981px]:inset-0 min-[981px]:overflow-y-auto">
          <AccordionSection id="eval" title="Evaluation" open={openSections.eval ?? false} onToggle={toggleSection}>
            <EvalChart reviews={reviews} selectedPly={ply} onSelect={navigate} totalPlies={totalPlies} />
          </AccordionSection>

          {accuracy && (
            <AccordionSection id="accuracy" title="Accuracy" open={openSections.accuracy ?? false} onToggle={toggleSection}>
              <AccuracyPanel
                white={accuracy.w}
                black={accuracy.b}
                whiteName={whiteName}
                blackName={blackName}
              />
            </AccordionSection>
          )}

          <AccordionSection id="moves" title="Moves" open={openSections.moves ?? false} onToggle={toggleSection}>
            <MoveList reviews={reviews} selectedPly={ply} onSelect={navigate} />
          </AccordionSection>
          </div>
        </div>

        <div className="[grid-area:input]">
          <PgnInput game={game} onGame={loadGame} />
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5 text-xs text-text-dim">
        <span className="flex-1 text-left">
          Engine: Stockfish 19 Lite (single-threaded WASM) · Win chance{' '}
          <code className="font-mono text-[0.9em] text-text-muted">1 / (1 + 10^(-cp/400))</code>
        </span>
        <span className="flex-1 text-center">Built by Nico Bernaola</span>
        <span className="flex-1 text-right">
          ← → to navigate · Home/End to jump
        </span>
      </footer>
    </div>
  )
}

interface AccordionSectionProps {
  id: string
  title: string
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}

function AccordionSection({ id, title, open, onToggle, children }: AccordionSectionProps) {
  return (
    <section className="shrink-0">
      <h2>
        <button
          type="button"
          id={`${id}-header`}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-left text-[13px] font-medium text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => onToggle(id)}
        >
          {title}
          <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
      </h2>
      <div id={`${id}-content`} role="region" aria-labelledby={`${id}-header`} hidden={!open} className="mt-3.5">
        {children}
      </div>
    </section>
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
      <div className="flex min-h-11 items-center gap-3.5 rounded-lg border border-[#fa412d]/45 bg-[#fa412d]/10 px-3.5 py-2.5 text-[13px] text-[#ffb3a9]" role="alert">
        <span>{error}</span>
        {onRetry && (
          <button type="button" className="btn bg-transparent" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    )
  }

  if (phase === 'loading-engine') {
    return (
      <div className="flex min-h-11 items-center gap-3.5 rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-[13px] text-text-muted">
        <span>Loading engine… {Math.round(engineLoad * 100)}%</span>
        <Progress value={engineLoad} />
      </div>
    )
  }

  if (phase === 'analyzing') {
    return (
      <div className="flex min-h-11 items-center gap-3.5 rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-[13px] text-text-muted">
        <span>
          Analyzing {analysed} / {total} positions
        </span>
        <Progress value={progress} />
      </div>
    )
  }

  if (phase === 'done') {
    return <div className="flex min-h-11 items-center gap-3.5 rounded-lg border border-accent/40 bg-accent/8 px-3.5 py-2.5 text-[13px] text-[#c3e2a3]">Analysis complete · {analysed} positions</div>
  }

  return <div className="flex min-h-11 items-center gap-3.5 rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-[13px] text-text-dim">Ready</div>
}

function Progress({ value }: { value: number }) {
  return (
    <span
      className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-[#232b35]"
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="block h-full rounded-[inherit] bg-gradient-to-r from-[#6f9e42] to-accent transition-[width] duration-150" style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  )
}
