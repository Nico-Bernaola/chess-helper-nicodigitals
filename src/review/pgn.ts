import { Chess } from 'chess.js'
import type { ParsedGame, ParsedMove } from '../types'

export interface ParsePgnResult {
  game: ParsedGame | null
  error: string | null
}

/**
 * Parses a PGN into a fully materialized list of positions.
 *
 * Storing `fenBefore`/`fenAfter` per move means the review loop and the board
 * never need to replay the game, so navigation is O(1).
 */
export function parsePgn(pgn: string): ParsePgnResult {
  const trimmed = pgn.trim()
  if (!trimmed) return { game: null, error: 'Paste a PGN to get started.' }

  const chess = new Chess()

  try {
    chess.loadPgn(trimmed, { strict: false })
  } catch (error) {
    return { game: null, error: `Invalid PGN: ${errorMessage(error)}` }
  }

  const headers = chess.getHeaders()
  const startFen = headers.FEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const history = chess.history({ verbose: true })

  if (history.length === 0) {
    return { game: null, error: 'This PGN has no moves.' }
  }

  const moves: ParsedMove[] = history.map((move, ply) => ({
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: move.color,
    san: move.san,
    lan: move.lan,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
    fenBefore: move.before,
    fenAfter: move.after,
    isCheck: move.san.includes('+') || move.san.includes('#'),
    isCheckmate: move.san.includes('#'),
    isEnPassant: move.isEnPassant(),
  }))

  const result = headers.Result ?? null

  return {
    game: {
      headers,
      startFen,
      positions: [startFen, ...moves.map((move) => move.fenAfter)],
      moves,
      result: result && result !== '*' ? result : null,
    },
    error: null,
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
