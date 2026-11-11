import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisResult, AnalyzedPosition, Color, MoveReview, ParsedGame } from '../types'
import { getEngine } from '../engine/enginePool'
import type { EngineClient } from '../engine/EngineClient'
import { classifyGame, summarizeAccuracy } from '../review/classifier'
import { errorMessage } from '../review/pgn'

export type ReviewPhase = 'idle' | 'loading-engine' | 'analyzing' | 'done' | 'error'

export interface ReviewState {
  phase: ReviewPhase
  /** Overall progress 0..1 of the position loop. */
  progress: number
  analysedPositions: number
  totalPositions: number
  /** Engine download progress 0..1, when the browser reports it. */
  engineLoad: number
  error: string | null
}

export interface UseGameReviewOptions {
  /** Fixed Stockfish search depth per position. */
  depth?: number
}

export type AccuracyByColor = Record<Color, ReturnType<typeof summarizeAccuracy>[Color]>

/** All review data produced for one specific game instance. */
interface ReviewOutput {
  forGame: ParsedGame
  state: ReviewState
  reviews: MoveReview[]
  accuracy: AccuracyByColor | null
}

const IDLE_STATE: ReviewState = {
  phase: 'idle',
  progress: 0,
  analysedPositions: 0,
  totalPositions: 0,
  engineLoad: 0,
  error: null,
}

const PENDING_STATE: ReviewState = { ...IDLE_STATE, phase: 'loading-engine' }

/**
 * Runs a full-game Stockfish review, one position at a time.
 *
 * Design:
 * - Results are tagged with the game they belong to. The hook exposes them only
 *   while that same game is current, so a stale review can never be rendered
 *   next to a different PGN.
 * - Only one search is in flight, which keeps the main thread free and memory
 *   flat no matter how long the game is.
 * - Positions are keyed by FEN, so transpositions and repetitions are searched
 *   once. Classification is re-run on the analysed prefix after every ply,
 *   which keeps the board and move list usable during the run.
 */
export function useGameReview(game: ParsedGame | null, options: UseGameReviewOptions = {}) {
  const { depth = 14 } = options

  const [output, setOutput] = useState<ReviewOutput | null>(null)
  const engineRef = useRef<EngineClient | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  // Derived, not stored: anything belonging to a previous game is ignored.
  const current = game && output?.forGame === game ? output : null

  const state = current?.state ?? (game ? PENDING_STATE : IDLE_STATE)
  const reviews = current?.reviews ?? EMPTY_REVIEWS
  const accuracy = current?.accuracy ?? null

  const abortActive = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    engineRef.current?.stop()
  }, [])

  const cancel = useCallback(() => {
    abortActive()
    if (!mountedRef.current) return

    // Keep whatever has been analysed so far, but stop advancing.
    setOutput((prev) =>
      prev && game && prev.forGame === game
        ? { ...prev, state: { ...prev.state, phase: 'idle' } }
        : prev,
    )
  }, [abortActive, game])

  const run = useCallback(
    async (target: ParsedGame) => {
      abortActive()

      const controller = new AbortController()
      abortRef.current = controller
      const emit = (patch: Partial<ReviewOutput>) =>
        setOutput((prev) => {
          const base: ReviewOutput =
            prev?.forGame === target
              ? prev
              : { forGame: target, state: PENDING_STATE, reviews: EMPTY_REVIEWS, accuracy: null }

          return {
            ...base,
            ...patch,
            state: { ...base.state, ...patch.state },
          }
        })

      try {
        engineRef.current ??= getEngine()
        const engine = engineRef.current

        await engine.start((load) => {
          if (!mountedRef.current || controller.signal.aborted) return
          emit({ state: { ...PENDING_STATE, engineLoad: load.percent } })
        })

        if (controller.signal.aborted) return

        const uniqueFens = dedupe(target.positions)
        const total = uniqueFens.length

        emit({
          state: {
            phase: 'analyzing',
            progress: 0,
            analysedPositions: 0,
            totalPositions: total,
            engineLoad: 1,
            error: null,
          },
        })

        const analysed = new Map<string, AnalyzedPosition>()
        let completed = 0

        for (const fen of uniqueFens) {
          if (controller.signal.aborted) return

          const result = await engine.analyze({ fen, depth, signal: controller.signal })
          const position = toAnalyzedPosition(result)
          if (position) analysed.set(fen, position)

          completed += 1
          if (controller.signal.aborted) return

          // Classification is pure and cheap; recomputing the whole prefix keeps
          // the labels correct even when a later position reveals a better move.
          const partial = classifyGame({ game: target, positions: analysed })
          emit({
            reviews: partial,
            accuracy: summarizeAccuracy(partial),
            state: {
              phase: 'analyzing',
              progress: completed / total,
              analysedPositions: completed,
              totalPositions: total,
              engineLoad: 1,
              error: null,
            },
          })
        }

        emit({
          state: {
            phase: 'done',
            progress: 1,
            analysedPositions: total,
            totalPositions: total,
            engineLoad: 1,
            error: null,
          },
        })
      } catch (error) {
        if (controller.signal.aborted) return
        if (!mountedRef.current) return
        emit({
          state: {
            ...PENDING_STATE,
            phase: 'error',
            engineLoad: 1,
            error: errorMessage(error),
          },
        })
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [abortActive, depth],
  )

  // Analyze on mount and whenever a new game is loaded. The cleanup aborts the
  // in-flight search, which also makes StrictMode's double-invoked effect safe:
  // the second setup starts a fresh run against the shared, still-warm engine.
  useEffect(() => {
    mountedRef.current = true
    if (!game) return

    void run(game)

    return () => {
      mountedRef.current = false
      abortActive()
    }
  }, [game, run, abortActive])

  const retry = useCallback(() => {
    if (game) void run(game)
  }, [game, run])

  return { state, reviews, accuracy, retry: game ? retry : undefined, cancel }
}

const EMPTY_REVIEWS: MoveReview[] = []

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Picks the review score for a position.
 *
 * The engine's first PV is the reference for every move in both colours: the
 * same depth and settings are used before and after each move, which keeps the
 * win-chance deltas comparable across the whole game.
 */
function toAnalyzedPosition(result: AnalysisResult): AnalyzedPosition | null {
  const best = result.lines[0]
  if (!best?.score) return null

  return {
    fen: result.fen,
    score: best.score,
    bestMove: result.bestMove,
    depth: best.depth,
  }
}
