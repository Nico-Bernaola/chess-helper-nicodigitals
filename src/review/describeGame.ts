import type { ParsedGame } from '../types'

/** One-line description of a parsed game, used in the PGN panel header. */
export function describeGame(game: ParsedGame): string {
  const { headers, moves } = game
  const white = displayName(headers.White, 'White')
  const black = displayName(headers.Black, 'Black')
  const result = game.result ? ` · ${game.result}` : ''
  return `${white} vs ${black}${result} · ${Math.ceil(moves.length / 2)} moves`
}

/** PGN parsers use "?" for unknown tag values; treat those as absent. */
export function displayName(value: string | undefined, fallback: string): string {
  if (!value || value === '?' || value === '-') return fallback
  return value
}
