import type { Color, PieceSymbol, Square } from 'chess.js'

export type { Color, PieceSymbol, Square }

/* ------------------------------------------------------------------ *
 * Engine                                                                *
 * ------------------------------------------------------------------ */

export type ScoreType = 'cp' | 'mate'

/** A UCI score. Always relative to the side to move in the analysed FEN. */
export interface EngineScore {
  type: ScoreType
  value: number
  bound?: 'lower' | 'upper'
}

export interface EngineInfo {
  depth: number
  seldepth?: number
  multipv: number
  score: EngineScore | null
  pv: string[]
  nodes?: number
  nps?: number
  timeMs?: number
}

export interface AnalysisResult {
  fen: string
  bestMove: string | null
  ponder: string | null
  /** One entry per MultiPV line, sorted by multipv. */
  lines: EngineInfo[]
  searchedDepth: number
}

/** The single value the review pipeline keeps from each search. */
export interface AnalyzedPosition {
  fen: string
  /** Best score found, from the point of view of the side to move. */
  score: EngineScore
  bestMove: string | null
  depth: number
}

/* ------------------------------------------------------------------ *
 * PGN                                                                   *
 * ------------------------------------------------------------------ */

export interface ParsedMove {
  /** 0-based ply index. */
  ply: number
  moveNumber: number
  color: Color
  san: string
  /** Long algebraic notation, e.g. `e2e4` or `e7e8q`. */
  lan: string
  from: Square
  to: Square
  piece: PieceSymbol
  captured?: PieceSymbol
  promotion?: PieceSymbol
  fenBefore: string
  fenAfter: string
  isCheck: boolean
  isCheckmate: boolean
  isEnPassant: boolean
}

export interface ParsedGame {
  headers: Record<string, string>
  startFen: string
  /** `positions[i]` is the FEN before move `i`; the last entry is the final position. */
  positions: string[]
  moves: ParsedMove[]
  result: string | null
}

/* ------------------------------------------------------------------ *
 * Review                                                                *
 * ------------------------------------------------------------------ */

export type MoveLabel =
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

export interface SacrificeInfo {
  isSacrifice: boolean
  /** Centipawns of material the mover offers, net of what the move captured. */
  materialGiven: number
  /**
   * Value of the piece the mover put at risk. Pawn sacrifices are not
   * "Brilliant" on Chess.com, so the classifier requires a piece here.
   */
  sacrificedPieceValue: number
  attackers: string[]
  defenders: string[]
}

export interface MoveReview {
  ply: number
  moveNumber: number
  color: Color
  san: string
  from: Square
  to: Square
  /** Played move in UCI, e.g. `g1f3`. */
  uci: string
  label: MoveLabel
  /** Win chance (0..1) for the player who moved, before and after playing. */
  winChanceBefore: number
  winChanceAfter: number
  /** Drop in win chance caused by the move (`before - after`, clamped to 0..1). */
  delta: number
  accuracy: number
  /** Evaluations from White's point of view, ready for display. */
  whiteScoreBefore: EngineScore
  whiteScoreAfter: EngineScore
  bestMoveUci: string | null
  bestMoveSan: string | null
  isBestMove: boolean
  sacrifice: SacrificeInfo
}

export interface AccuracySummary {
  color: Color
  moves: number
  accuracy: number
  counts: Record<MoveLabel, number>
}
