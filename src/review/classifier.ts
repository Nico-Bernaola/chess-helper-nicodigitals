import { Chess } from 'chess.js'
import type {
  AccuracySummary,
  AnalyzedPosition,
  Color,
  MoveLabel,
  MoveReview,
  ParsedGame,
  ParsedMove,
} from '../types'
import { detectSacrifice, PIECE_VALUES } from './sacrifice'
import { accuracyFromWinChanceLoss, scoreForWhite, winChanceForWhite } from './winChance'

/* ------------------------------------------------------------------ *
 * Thresholds                                                           *
 * ------------------------------------------------------------------ */

/**
 * Label boundaries, expressed as win-chance loss (0..1).
 * They follow the familiar Chess.com ladder: a move that costs less than 2 %
 * of win probability is effectively as good as the engine's choice.
 */
export const LABEL_THRESHOLDS = {
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
} as const

/**
 * Minimum net material (centipawns) the move must offer. A pawn is the floor,
 * so trading a piece for a pawn still counts; the *kind* of piece at risk is
 * checked separately (`sacrificedPieceValue`).
 */
export const BRILLIANT_MIN_SACRIFICE = 100

/**
 * Minimum win chance after the move for a sacrifice to be called Brilliant.
 * The sacrifice has to be sound: it must keep at least an equal game.
 */
export const BRILLIANT_MIN_WIN_CHANCE = 0.5

/** Above this win chance the mover is already winning, so sacrifices aren't special. */
export const BRILLIANT_MAX_WIN_CHANCE_BEFORE = 0.97

export interface ClassifyMoveInput {
  move: ParsedMove
  /** Analysis of the position *before* the move (mover's point of view). */
  before: AnalyzedPosition
  /** Analysis of the position *after* the move (opponent's point of view). */
  after: AnalyzedPosition
}

/**
 * Classifies one move from the two analysed positions.
 *
 * Both engine scores arrive from the point of view of the side to move, so the
 * "after" score is first mirrored to keep a single reference frame: the player
 * who made the move.
 */
export function classifyMove({ move, before, after }: ClassifyMoveInput): MoveReview {
  const scoreBefore = before.score
  const scoreAfter = after.score

  // Everything numeric is computed in White's frame. Inverting scores is not
  // equivalent to inverting probabilities for terminal positions (mate 0).
  const whiteBefore = winChanceForWhite(scoreBefore, move.color)
  const whiteAfter = winChanceForWhite(scoreAfter, opposite(move.color))

  const winChanceBefore = moverChance(whiteBefore, move.color)
  const winChanceAfter = moverChance(whiteAfter, move.color)
  let delta = clamp01(winChanceBefore - winChanceAfter)

  // A forced mate that is thrown away is a total loss of advantage, even though
  // the sigmoid cannot reach 0 for a large-but-finite evaluation.
  if (scoreBefore.type === 'mate' && scoreBefore.value > 0 && scoreAfter.type !== 'mate') {
    delta = 1
  }

  const bestMoveUci = before.bestMove
  const uci = move.lan.toLowerCase()
  const isBestMove = bestMoveUci !== null && normalizeUci(bestMoveUci) === normalizeUci(uci)

  // A forced reply (typically escaping check) is not a voluntary sacrifice.
  const forced = isOnlyLegalMove(move.fenBefore)
  const sacrifice = forced ? NO_SACRIFICE : detectSacrifice(move)
  const label = pickLabel({
    delta,
    isBestMove,
    winChanceBefore,
    winChanceAfter,
    sacrifice,
    move,
    after,
  })

  return {
    ply: move.ply,
    moveNumber: move.moveNumber,
    color: move.color,
    san: move.san,
    from: move.from,
    to: move.to,
    uci,
    label,
    winChanceBefore,
    winChanceAfter,
    delta,
    accuracy: accuracyFromWinChanceLoss(delta),
    whiteScoreBefore: scoreForWhite(scoreBefore, move.color),
    whiteScoreAfter: scoreForWhite(scoreAfter, opposite(move.color)),
    bestMoveUci,
    bestMoveSan: bestMoveUci ? uciToSan(move.fenBefore, bestMoveUci) : null,
    isBestMove,
    sacrifice,
  }
}

interface LabelInput {
  delta: number
  isBestMove: boolean
  winChanceBefore: number
  winChanceAfter: number
  sacrifice: ReturnType<typeof detectSacrifice>
  move: ParsedMove
  after: AnalyzedPosition
}

export function pickLabel(input: LabelInput): MoveLabel {
  const { delta, isBestMove, winChanceBefore, winChanceAfter, sacrifice, move } = input

  // Brilliant = a sound *piece* sacrifice that is also the engine's own choice.
  // Pawn sacrifices are excluded: the label is reserved for real material.
  if (
    sacrifice.isSacrifice &&
    isBestMove &&
    sacrifice.sacrificedPieceValue >= PIECE_VALUES.n &&
    sacrifice.materialGiven >= BRILLIANT_MIN_SACRIFICE &&
    winChanceAfter >= BRILLIANT_MIN_WIN_CHANCE &&
    winChanceBefore < BRILLIANT_MAX_WIN_CHANCE_BEFORE &&
    delta <= LABEL_THRESHOLDS.excellent &&
    !move.isCheckmate
  ) {
    return 'brilliant'
  }

  if (isBestMove && delta <= LABEL_THRESHOLDS.excellent) return 'best'
  if (delta <= LABEL_THRESHOLDS.excellent) return 'excellent'
  if (delta <= LABEL_THRESHOLDS.good) return 'good'
  if (delta <= LABEL_THRESHOLDS.inaccuracy) return 'inaccuracy'
  if (delta <= LABEL_THRESHOLDS.mistake) return 'mistake'
  return 'blunder'
}

/* ------------------------------------------------------------------ *
 * Whole-game review                                                    *
 * ------------------------------------------------------------------ */

export interface ClassificationInput {
  game: ParsedGame
  positions: Map<string, AnalyzedPosition>
}

/**
 * Builds the full review for a game.
 *
 * `positions` must contain the analysis of every FEN in `game.positions`
 * (N+1 entries for N moves). Missing entries are skipped rather than guessed,
 * so a partially analysed game still yields a valid partial review.
 */
export function classifyGame({ game, positions }: ClassificationInput): MoveReview[] {
  const reviews: MoveReview[] = []

  for (const move of game.moves) {
    const before = positions.get(move.fenBefore)
    const after = positions.get(move.fenAfter)
    if (!before || !after) continue

    reviews.push(classifyMove({ move, before, after }))
  }

  return reviews
}

/** Aggregates accuracy and label counts per side. */
export function summarizeAccuracy(reviews: MoveReview[]): Record<Color, AccuracySummary> {
  const summary: Record<Color, AccuracySummary> = {
    w: emptySummary('w'),
    b: emptySummary('b'),
  }

  for (const review of reviews) {
    const bucket = summary[review.color]
    bucket.moves += 1
    bucket.accuracy += review.accuracy
    bucket.counts[review.label] += 1
  }

  for (const color of ['w', 'b'] as const) {
    const bucket = summary[color]
    bucket.accuracy = bucket.moves === 0 ? 0 : round(bucket.accuracy / bucket.moves, 1)
  }

  return summary
}

function emptySummary(color: Color): AccuracySummary {
  return {
    color,
    moves: 0,
    accuracy: 0,
    counts: {
      brilliant: 0,
      best: 0,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    },
  }
}

/* ------------------------------------------------------------------ *
 * Helpers                                                              *
 * ------------------------------------------------------------------ */

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

const NO_SACRIFICE = {
  isSacrifice: false,
  materialGiven: 0,
  sacrificedPieceValue: 0,
  attackers: [],
  defenders: [],
}

/** True when the position has exactly one legal move. */
function isOnlyLegalMove(fen: string): boolean {
  try {
    return new Chess(fen).moves().length <= 1
  } catch {
    return false
  }
}

/** Converts White's win chance into the mover's point of view. */
function moverChance(whiteChance: number, mover: Color): number {
  return mover === 'w' ? whiteChance : 1 - whiteChance
}

/** `g1f3` and `g1f3q` compare equal on the non-promotion part. */
function normalizeUci(uci: string): string {
  return uci.toLowerCase().replace(/[^a-h1-8nbrq]/g, '')
}

/** Converts a UCI move into SAN in the given position, falling back to UCI. */
export function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
