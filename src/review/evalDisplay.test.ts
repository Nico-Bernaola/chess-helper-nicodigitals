import { describe, expect, it } from 'vitest'
import { evalForPlayer } from './evalDisplay'
import type { MoveReview } from '../types'

function review(overrides: Partial<MoveReview>): MoveReview {
  return {
    ply: 0,
    moveNumber: 1,
    color: 'w',
    san: 'e4',
    from: 'e2',
    to: 'e4',
    uci: 'e2e4',
    label: 'best',
    winChanceBefore: 0.5,
    winChanceAfter: 0.5,
    delta: 0,
    accuracy: 100,
    whiteScoreBefore: { type: 'cp', value: 0 },
    whiteScoreAfter: { type: 'cp', value: 0 },
    bestMoveUci: null,
    bestMoveSan: null,
    isBestMove: false,
    sacrifice: { isSacrifice: false, materialGiven: 0, sacrificedPieceValue: 0, attackers: [], defenders: [] },
    ...overrides,
  }
}

describe('evalForPlayer', () => {
  it('shows the White score to White and its mirror to Black', () => {
    const item = review({ whiteScoreAfter: { type: 'cp', value: 290 } })
    expect(evalForPlayer('w', item)).toBe('+2.90')
    expect(evalForPlayer('b', item)).toBe('-2.90')
  })

  it('gives the # marker only to the side that delivered mate', () => {
    const item = review({ color: 'w', whiteScoreAfter: { type: 'mate', value: 0 } })
    expect(evalForPlayer('w', item)).toBe('#')
    expect(evalForPlayer('b', item)).toBeNull()
  })

  it('handles a mate that has not yet been played', () => {
    const item = review({ color: 'w', whiteScoreAfter: { type: 'mate', value: 3 } })
    expect(evalForPlayer('w', item)).toBe('+M3')
    expect(evalForPlayer('b', item)).toBe('-M3')
  })

  it('returns null without a review', () => {
    expect(evalForPlayer('w', null)).toBeNull()
  })
})
