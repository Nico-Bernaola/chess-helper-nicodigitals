import { Chess } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'
import type { ParsedMove, SacrificeInfo } from '../types'

/** Conventional centipawn values used for material arithmetic. */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20_000,
}

/**
 * Approximate static exchange evaluation on a single square.
 *
 * Captures are simulated on a cloned board, always choosing the cheapest
 * attacker first. Returns the material the side to move wins by starting the
 * exchange (negative means the exchange is bad for them).
 *
 * This is the classic SEE heuristic: it does not consider pins beyond legality
 * (illegal recaptures are skipped) and ignores strategic compensation.
 */
export function staticExchange(fen: string, square: Square, maxCaptures = 12): number {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return 0
  }

  let balance = 0
  let sign = 1

  for (let ply = 0; ply < maxCaptures; ply++) {
    const standing = chess.get(square)
    if (!standing) break

    const attackers = chess.attackers(square, chess.turn())
    if (attackers.length === 0) break

    const ordered = [...attackers].sort((a, b) => {
      const valueA = chess.get(a)
      const valueB = chess.get(b)
      return (valueA ? PIECE_VALUES[valueA.type] : 0) - (valueB ? PIECE_VALUES[valueB.type] : 0)
    })

    let captured = false
    for (const from of ordered) {
      try {
        chess.move({ from, to: square, promotion: 'q' })
        balance += sign * PIECE_VALUES[standing.type]
        sign = -sign
        captured = true
        break
      } catch {
        // Pinned or otherwise illegal capture: try the next attacker.
      }
    }

    if (!captured) break
  }

  return balance
}

/**
 * Heuristic sacrifice detector.
 *
 * A move offers material when, in the resulting position, the opponent can win
 * more material on the destination square than the value the mover just
 * captured. The net figure, in centipawns, is:
 *
 *   materialGiven = max(0, opponentSEE) - value(capturedPiece)
 *
 * Cases covered: pieces left en prise, a piece offered for a cheaper attacker,
 * exchange sacrifices and combinations on one square. Discovered sacrifices (a
 * piece abandoned elsewhere on the board) are out of scope; the win-chance
 * delta still labels those moves correctly.
 *
 * `sacrificedPieceValue` reports the piece actually placed at risk, so callers
 * can distinguish a pawn sacrifice from a piece sacrifice.
 */
export function detectSacrifice(move: ParsedMove): SacrificeInfo {
  const empty: SacrificeInfo = {
    isSacrifice: false,
    materialGiven: 0,
    sacrificedPieceValue: 0,
    attackers: [],
    defenders: [],
  }

  if (move.isEnPassant) return empty

  let chess: Chess
  try {
    chess = new Chess(move.fenAfter)
  } catch {
    return empty
  }

  const opponent = chess.turn()
  const mover = opponent === 'w' ? 'b' : 'w'
  const attackers = chess.attackers(move.to, opponent)
  if (attackers.length === 0) return empty

  const defenders = chess.attackers(move.to, mover)
  const standing = chess.get(move.to)
  const opponentSee = Math.max(0, staticExchange(move.fenAfter, move.to))
  const capturedValue = move.captured ? PIECE_VALUES[move.captured] : 0
  const materialGiven = Math.max(0, opponentSee - capturedValue)

  return {
    isSacrifice: materialGiven >= PIECE_VALUES.p,
    materialGiven,
    // A queen sacrifice is represented by the piece that replaced it.
    sacrificedPieceValue: standing ? PIECE_VALUES[standing.type] : 0,
    attackers,
    defenders,
  }
}
