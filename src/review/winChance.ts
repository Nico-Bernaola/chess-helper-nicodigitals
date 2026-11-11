import type { EngineScore } from '../types'

/** Scale of the logistic win-probability curve, in centipawns. */
export const WIN_CHANCE_SCALE = 400

/** Centipawn magnitude used to represent forced mates in numeric comparisons. */
export const MATE_CP = 10_000

/**
 * Win probability for the side to move, from a centipawn evaluation.
 *
 *   WinChance = 1 / (1 + 10^(-cp / 400))
 *
 * A +400 cp advantage maps to 90 %, -400 cp to 10 %, 0 to 50 %.
 */
export function winChanceFromCp(cp: number): number {
  return 1 / (1 + 10 ** (-cp / WIN_CHANCE_SCALE))
}

/**
 * Win probability for the side to move, from a UCI score.
 * Mates saturate the curve: delivering mate is a certain win, being mated is 0.
 */
export function winChanceFromScore(score: EngineScore): number {
  if (score.type === 'mate') {
    if (score.value > 0) return 1
    return 0
  }
  return winChanceFromCp(score.value)
}

/**
 * Win probability for White, from a side-to-move score.
 *
 * Probabilities are always combined in a single White-relative frame rather
 * than by negating scores. This matters for terminal positions: `mate 0` means
 * "the side to move is mated", and negating it yields the same value, while
 * `1 - p` correctly flips the outcome to the other player.
 */
export function winChanceForWhite(score: EngineScore, sideToMove: 'w' | 'b'): number {
  const chance = winChanceFromScore(score)
  return sideToMove === 'w' ? chance : 1 - chance
}

/**
 * Converts a side-to-move score into White's point of view.
 *
 * `mate 0` is left as-is: `formatScore` renders it as `#`, meaning the mate has
 * already been delivered on the board (by whichever side just moved).
 */
export function scoreForWhite(score: EngineScore, sideToMove: 'w' | 'b'): EngineScore {
  if (sideToMove === 'w') return { ...score }
  return { type: score.type, value: -score.value, bound: score.bound }
}

/**
 * Collapses cp and mate scores into a single centipawn scale so that
 * comparisons and chart axes behave monotonically. Closer mates rank higher.
 */
export function scoreToCp(score: EngineScore): number {
  if (score.type === 'cp') return score.value
  if (score.value === 0) return -MATE_CP
  const distance = Math.min(Math.abs(score.value), 100)
  return score.value > 0 ? MATE_CP - distance : -MATE_CP + distance
}

/** Flips a score to the opposite point of view. */
export function invertScore(score: EngineScore): EngineScore {
  return { type: score.type, value: -score.value, bound: score.bound }
}

/**
 * Estimated per-move accuracy (0..100) from a drop in win probability.
 * Based on the widely used Lichess derivation of the Chess.com accuracy curve.
 * Rounded to one decimal, which is the precision shown in the UI.
 */
export function accuracyFromWinChanceLoss(loss: number): number {
  const lossPercent = clamp(loss, 0, 1) * 100
  const raw = 103.1668 * Math.exp(-0.04354 * lossPercent) - 3.1669
  return Math.round(clamp(raw, 0, 100) * 10) / 10
}

/** Formats a score from White's point of view, e.g. `+1.24`, `-0.35`, `+M3`. */
export function formatScore(score: EngineScore): string {
  if (score.type === 'mate') {
    if (score.value === 0) return '#'
    return `${score.value > 0 ? '+' : '-'}M${Math.abs(score.value)}`
  }
  const pawns = score.value / 100
  const sign = pawns > 0 ? '+' : pawns < 0 ? '-' : ''
  return `${sign}${Math.abs(pawns).toFixed(2)}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
