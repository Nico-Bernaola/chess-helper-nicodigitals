import { describe, expect, it } from 'vitest'
import { classifyGame, classifyMove, pickLabel, summarizeAccuracy } from './classifier'
import { parsePgn } from './pgn'
import { detectSacrifice } from './sacrifice'
import type { AnalyzedPosition, EngineScore, ParsedMove } from '../types'

const SCHOLARS_MATE = `[Event "Test"]
[White "Beginner"]
[Black "Beginner"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`

const LEGAL_GAME = `[White "Anderssen"]
[Black "Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5
8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8
15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6
21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`

function analyze(score: EngineScore, bestMove: string | null, fen = 'x'): AnalyzedPosition {
  return { fen, score, bestMove, depth: 14 }
}

function move(overrides: Partial<ParsedMove>): ParsedMove {
  return {
    ply: 0,
    moveNumber: 1,
    color: 'w',
    san: 'e4',
    lan: 'e2e4',
    from: 'e2',
    to: 'e4',
    piece: 'p',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    isCheck: false,
    isCheckmate: false,
    isEnPassant: false,
    ...overrides,
  }
}

describe('parsePgn', () => {
  it('captures every position including the start', () => {
    const { game, error } = parsePgn(SCHOLARS_MATE)
    expect(error).toBeNull()
    expect(game?.moves).toHaveLength(7)
    expect(game?.positions).toHaveLength(8)
    expect(game?.result).toBe('1-0')
    expect(game?.moves.at(-1)?.isCheckmate).toBe(true)
  })

  it('produces long algebraic moves for engine match-ups', () => {
    const { game } = parsePgn(SCHOLARS_MATE)
    expect(game?.moves[0].lan).toBe('e2e4')
    expect(game?.moves[1].lan).toBe('e7e5')
  })

  it('supports FEN start positions', () => {
    const pgn = `[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
[SetUp "1"]

1. e4 Kd7 2. e5 *`
    const { game, error } = parsePgn(pgn)
    expect(error).toBeNull()
    expect(game?.startFen).toContain('4k3')
  })

  it('rejects garbage and empty input', () => {
    expect(parsePgn('').game).toBeNull()
    expect(parsePgn('this is not a pgn').game).toBeNull()
  })
})

describe('classifyMove', () => {
  it('labels the engine choice as best', () => {
    const review = classifyMove({
      move: move({}),
      before: analyze({ type: 'cp', value: 30 }, 'e2e4'),
      after: analyze({ type: 'cp', value: -30 }, 'e7e5'),
    })

    expect(review.label).toBe('best')
    expect(review.isBestMove).toBe(true)
    expect(review.delta).toBeCloseTo(0, 6)
    expect(review.winChanceBefore).toBeCloseTo(review.winChanceAfter, 6)
  })

  it('mirrors the opponent score into the mover frame', () => {
    // White is +100 before, Black is +200 after playing their move: White lost
    // 300 cp, so the "after" score for White is -200.
    const review = classifyMove({
      move: move({ color: 'w', lan: 'd2d4', san: 'd4' }),
      before: analyze({ type: 'cp', value: 100 }, 'd2d4'),
      after: analyze({ type: 'cp', value: 200 }, 'd7d5'),
    })

    expect(review.whiteScoreAfter.value).toBe(-200)
    expect(review.winChanceAfter).toBeLessThan(0.5)
    expect(review.delta).toBeGreaterThan(0)
  })

  it('escalates labels as the loss grows', () => {
    // Invert the sigmoid to get the centipawns needed for a given win-chance
    // loss: loss = 0.5 - 1/(1 + 10^(cp/400)).
    const cpForLoss = (loss: number) =>
      -400 * Math.log10((0.5 + loss) / (0.5 - loss))

    const labelFor = (loss: number) => {
      // The "after" score belongs to the side to move in that position, which is
      // the opponent: a loss for the mover is a gain for them.
      const afterForOpponent = -cpForLoss(loss)
      return classifyMove({
        move: move({ lan: 'b1c3' }),
        before: analyze({ type: 'cp', value: 0 }, 'g1f3'),
        after: analyze({ type: 'cp', value: afterForOpponent }, 'g8f6'),
      }).label
    }

    expect(labelFor(0)).toBe('excellent')
    expect(labelFor(0.03)).toBe('good')
    expect(labelFor(0.07)).toBe('inaccuracy')
    expect(labelFor(0.15)).toBe('mistake')
    expect(labelFor(0.35)).toBe('blunder')
  })

  it('detects a mate-to-lost swing as a blunder', () => {
    const review = classifyMove({
      move: move({ san: 'Kh2', lan: 'h1h2' }),
      before: analyze({ type: 'mate', value: 2 }, 'g1f3'),
      after: analyze({ type: 'cp', value: 900 }, 'd8h4'),
    })

    // Missing a forced mate is a full win-chance loss.
    expect(review.label).toBe('blunder')
    expect(review.delta).toBe(1)
    expect(review.accuracy).toBe(0)
  })
})

describe('brilliant heuristic', () => {
  it('marks a sound piece sacrifice as brilliant', () => {
    const review = pickLabel({
      delta: 0.005,
      isBestMove: true,
      winChanceBefore: 0.8,
      winChanceAfter: 0.79,
      sacrifice: { isSacrifice: true, materialGiven: 320, sacrificedPieceValue: 320, attackers: ['d8'], defenders: [] },
      move: move({}),
      after: analyze({ type: 'cp', value: -200 }, 'f3e5'),
    })

    expect(review).toBe('brilliant')
  })

  it('does not award brilliant when the mover is already lost', () => {
    const review = pickLabel({
      delta: 0.005,
      isBestMove: true,
      winChanceBefore: 0.1,
      winChanceAfter: 0.09,
      sacrifice: { isSacrifice: true, materialGiven: 500, sacrificedPieceValue: 900, attackers: ['d8'], defenders: [] },
      move: move({}),
      after: analyze({ type: 'cp', value: 500 }, 'f3e5'),
    })

    expect(review).not.toBe('brilliant')
  })

  it('does not award brilliant for a losing sacrifice', () => {
    const review = pickLabel({
      delta: 0.3,
      isBestMove: false,
      winChanceBefore: 0.7,
      winChanceAfter: 0.4,
      sacrifice: { isSacrifice: true, materialGiven: 900, sacrificedPieceValue: 900, attackers: ['d8'], defenders: [] },
      move: move({}),
      after: analyze({ type: 'cp', value: -300 }, 'f3e5'),
    })

    expect(review).toBe('blunder')
  })
})

describe('detectSacrifice', () => {
  it('flags a knight captured by a pawn that recaptures', () => {
    // 1. Nf3 d5 2. Ng5 h6 3. Nxf7 Kxf7: the knight grabs a pawn and is taken
    // by the king, a net loss of a piece.
    const { game } = parsePgn('1. Nf3 d5 2. Ng5 h6 3. Nxf7 Kxf7 *')
    const knightMove = game!.moves[4]
    expect(knightMove.san).toBe('Nxf7')
    expect(knightMove.piece).toBe('n')
    expect(knightMove.captured).toBe('p')

    const info = detectSacrifice(knightMove)
    expect(info.isSacrifice).toBe(true)
    expect(info.materialGiven).toBeGreaterThanOrEqual(200)
    expect(info.attackers).toContain('e8')
  })

  it('does not flag an ordinary developing move', () => {
    const { game } = parsePgn('1. e4 e5 2. Nf3 *')
    const info = detectSacrifice(game!.moves[2])
    expect(info.isSacrifice).toBe(false)
  })

  it('does not flag a queen trade', () => {
    const { game } = parsePgn('1. e4 e5 2. Qh5 Nc6 3. Qxe5+ *')
    const info = detectSacrifice(game!.moves[2])
    expect(info.isSacrifice).toBe(false)
  })

  it('measures material net of what the move captured', () => {
    // ...Nxf6 in the Immortal Game: a knight takes a queen but the board allows
    // a bigger recapture, so the net figure must stay small.
    const { game } = parsePgn(
      '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 ' +
        '8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 ' +
        '15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 ' +
        '21. Nxg7+ Kd8 22. Qf6+ Nxf6 *',
    )
    const capture = game!.moves.at(-1)!
    expect(capture.captured).toBe('q')
    const info = detectSacrifice(capture)
    expect(info.materialGiven).toBe(220)
  })
})

describe('classifyGame', () => {
  it('produces one review per analysed move', () => {
    const { game } = parsePgn(SCHOLARS_MATE)
    const positions = new Map<string, AnalyzedPosition>()

    // Constant evaluation for both sides: every move is neutral.
    for (const fen of game!.positions) {
      positions.set(fen, analyze({ type: 'cp', value: 0 }, null, fen))
    }

    const reviews = classifyGame({ game: game!, positions })
    expect(reviews).toHaveLength(7)
    expect(reviews[0].label).toBe('excellent')
  })

  it('skips moves whose positions are missing', () => {
    const { game } = parsePgn(SCHOLARS_MATE)
    const positions = new Map<string, AnalyzedPosition>()
    positions.set(game!.positions[0], analyze({ type: 'cp', value: 20 }, 'e2e4', game!.positions[0]))

    expect(classifyGame({ game: game!, positions })).toHaveLength(0)
  })
})

describe('summarizeAccuracy', () => {
  it('averages per side and counts labels', () => {
    const { game } = parsePgn(SCHOLARS_MATE)
    const positions = new Map<string, AnalyzedPosition>()
    for (const fen of game!.positions) {
      positions.set(fen, analyze({ type: 'cp', value: 0 }, null, fen))
    }

    const summary = summarizeAccuracy(classifyGame({ game: game!, positions }))
    expect(summary.w.moves).toBe(4)
    expect(summary.b.moves).toBe(3)
    expect(summary.w.accuracy).toBeGreaterThan(99)
    expect(summary.w.counts.excellent + summary.w.counts.best).toBe(4)
  })
})

describe('legal game fixture', () => {
  it('parses the immortal game end to end', () => {
    const { game, error } = parsePgn(LEGAL_GAME)
    expect(error).toBeNull()
    expect(game?.moves).toHaveLength(45)
    expect(game?.moves.at(-1)?.san).toBe('Be7#')

    const positions = new Map<string, AnalyzedPosition>()
    for (const fen of game!.positions) {
      positions.set(fen, analyze({ type: 'cp', value: 0 }, null, fen))
    }
    const reviews = classifyGame({ game: game!, positions })
    expect(reviews).toHaveLength(45)
    expect(reviews.every((review) => review.accuracy >= 0 && review.accuracy <= 100)).toBe(true)
  })
})
