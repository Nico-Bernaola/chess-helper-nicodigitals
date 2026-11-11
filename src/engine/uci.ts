import type { EngineInfo, EngineScore } from '../types'

/**
 * Parses one Stockfish UCI `info` line.
 *
 * Example:
 *   info depth 14 seldepth 18 multipv 1 score cp 24 nodes 123 nps 4567
 *        time 27 pv e2e4 e7e5 g1f3
 *
 * Returns null for lines that carry no score (e.g. `info currmove`).
 */
export function parseInfo(line: string): EngineInfo | null {
  if (!line.startsWith('info')) return null

  const tokens = line.split(/\s+/)
  const info: EngineInfo = { depth: 0, multipv: 1, score: null, pv: [] }

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]

    switch (token) {
      case 'depth':
        info.depth = toInt(tokens[++i])
        break
      case 'seldepth':
        info.seldepth = toInt(tokens[++i])
        break
      case 'multipv':
        info.multipv = Math.max(1, toInt(tokens[++i]))
        break
      case 'nodes':
        info.nodes = toInt(tokens[++i])
        break
      case 'nps':
        info.nps = toInt(tokens[++i])
        break
      case 'time':
        info.timeMs = toInt(tokens[++i])
        break
      case 'score':
        info.score = parseScore(tokens, i)
        i += info.score.bound ? 3 : 2
        break
      case 'pv':
        info.pv = tokens.slice(i + 1)
        i = tokens.length
        break
      default:
        break
    }
  }

  return info.score || info.pv.length > 0 ? info : null
}

function parseScore(tokens: string[], index: number): EngineScore {
  const type = tokens[index + 1] === 'mate' ? 'mate' : 'cp'
  const value = toInt(tokens[index + 2])
  const maybeBound = tokens[index + 3]

  return {
    type,
    value,
    bound: maybeBound === 'lowerbound' || maybeBound === 'upperbound' ? maybeBound.replace('bound', '') as 'lower' | 'upper' : undefined,
  }
}

/** Parses `bestmove e2e4 ponder e7e5`. */
export function parseBestMove(line: string): { bestMove: string | null; ponder: string | null } | null {
  if (!line.startsWith('bestmove')) return null

  const tokens = line.split(/\s+/)
  const bestMove = tokens[1] && tokens[1] !== '(none)' ? tokens[1] : null
  const ponderIndex = tokens.indexOf('ponder')
  const ponder = ponderIndex !== -1 ? tokens[ponderIndex + 1] ?? null : null

  return { bestMove, ponder }
}

function toInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : 0
}
