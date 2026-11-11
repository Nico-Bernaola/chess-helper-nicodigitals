import type { Color, EngineScore, MoveReview } from '../types'
import { formatScore } from './winChance'

/**
 * Evaluation to show next to a player, from their own point of view.
 *
 * `review.whiteScoreAfter` is White-relative, so Black's number is its mirror.
 * At `mate 0` the side to move is already mated: only the player who delivered
 * it gets the `#` marker, and the opponent's bar shows nothing.
 */
export function evalForPlayer(color: Color, review: MoveReview | null): string | null {
  if (!review) return null

  const score = forPlayer(review.whiteScoreAfter, color)
  if (score.type === 'mate' && score.value === 0) {
    return review.color === color ? '#' : null
  }

  return formatScore(score)
}

function forPlayer(whiteScore: EngineScore, color: Color): EngineScore {
  if (color === 'w') return whiteScore
  return { type: whiteScore.type, value: -whiteScore.value, bound: whiteScore.bound }
}
