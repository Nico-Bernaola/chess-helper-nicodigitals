import { useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import type { EngineScore, MoveReview, ParsedGame } from '../types'
import { LABEL_STYLES } from '../review/labels'
import { formatScore } from '../review/winChance'

interface BoardPanelProps {
  game: ParsedGame | null
  /** Position shown on the board. */
  fen: string
  /** Last move played, highlighted on the board. */
  lastMove: MoveReview | null
  /** Review of the move that produced the current position. */
  currentReview: MoveReview | null
  orientation: 'white' | 'black'
  onFlip: () => void
  onNavigate: (ply: number) => void
  totalPlies: number
  /** Selected ply, 0-based index into `game.positions`. */
  ply: number
}

const PLAYER_COLORS = {
  w: '#f4f6f8',
  b: '#1c2026',
} as const

/**
 * Board plus navigation controls.
 *
 * The board is strictly read-only: this is a review tool, so dragging is
 * disabled and clicks are reserved for navigation.
 */
export function BoardPanel({
  game,
  fen,
  lastMove,
  currentReview,
  orientation,
  onFlip,
  onNavigate,
  totalPlies,
  ply,
}: BoardPanelProps) {
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}

    if (lastMove) {
      const highlight = currentReview
        ? `${LABEL_STYLES[currentReview.label].color}55`
        : 'rgba(122, 160, 255, 0.35)'

      styles[lastMove.from] = { backgroundColor: highlight }
      styles[lastMove.to] = {
        backgroundColor: highlight,
        boxShadow: `inset 0 0 0 3px ${currentReview ? LABEL_STYLES[currentReview.label].color : '#7aa0ff'}`,
      }
    }

    return styles
  }, [lastMove, currentReview])

  const headers = game?.headers ?? {}
  const whiteName = headers.White || 'White'
  const blackName = headers.Black || 'Black'
  const topPlayer = orientation === 'white' ? blackName : whiteName
  const bottomPlayer = orientation === 'white' ? whiteName : blackName

  return (
    <section className="board-panel">
      <PlayerBar
        name={topPlayer}
        color={orientation === 'white' ? 'b' : 'w'}
        score={evalFor(topPlayerColor(orientation, 'top'), currentReview)}
      />

      <div className="board-panel__board">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            showAnimations: true,
            animationDurationInMs: 180,
            squareStyles,
            darkSquareStyle: { backgroundColor: '#6c8299' },
            lightSquareStyle: { backgroundColor: '#dfe7ee' },
            boardStyle: { borderRadius: '10px', overflow: 'hidden' },
            showNotation: true,
          }}
        />
      </div>

      <PlayerBar
        name={bottomPlayer}
        color={orientation === 'white' ? 'w' : 'b'}
        score={evalFor(topPlayerColor(orientation, 'bottom'), currentReview)}
      />

      <div className="board-panel__controls">
        <button type="button" onClick={() => onNavigate(0)} disabled={ply === 0} title="Start">
          ⏮
        </button>
        <button type="button" onClick={() => onNavigate(ply - 1)} disabled={ply === 0} title="Previous move">
          ◀
        </button>
        <span className="board-panel__counter">
          {ply} / {totalPlies}
        </span>
        <button
          type="button"
          onClick={() => onNavigate(ply + 1)}
          disabled={ply >= totalPlies}
          title="Next move"
        >
          ▶
        </button>
        <button type="button" onClick={() => onNavigate(totalPlies)} disabled={ply >= totalPlies} title="End">
          ⏭
        </button>
        <button type="button" onClick={onFlip} title="Flip board" className="board-panel__flip">
          ⇅
        </button>
      </div>

      {currentReview && (
        <div className="board-panel__note" style={{ borderColor: LABEL_STYLES[currentReview.label].color }}>
          <span className="board-panel__note-move">
            {currentReview.moveNumber}
            {currentReview.color === 'w' ? '.' : '...'} {currentReview.san}
          </span>
          <span
            className="board-panel__note-label"
            style={{ color: LABEL_STYLES[currentReview.label].color }}
          >
            {LABEL_STYLES[currentReview.label].name}
          </span>
          <span className="board-panel__note-detail">
            {currentReview.isBestMove
              ? 'Engine top choice'
              : currentReview.bestMoveSan
                ? `Best was ${currentReview.bestMoveSan}`
                : '—'}
          </span>
        </div>
      )}
    </section>
  )
}

interface PlayerBarProps {
  name: string
  color: 'w' | 'b'
  score: string | null
}

function PlayerBar({ name, color, score }: PlayerBarProps) {
  return (
    <div className="player-bar">
      <span className="player-bar__dot" style={{ backgroundColor: PLAYER_COLORS[color] }} />
      <span className="player-bar__name">{name}</span>
      {score && <span className="player-bar__score">{score}</span>}
    </div>
  )
}

/** Recent evaluation for the side sitting on that edge of the board. */
function evalFor(color: 'w' | 'b', review: MoveReview | null): string | null {
  if (!review) return null
  const score = color === 'w' ? review.whiteScoreAfter : invertForBlack(review.whiteScoreAfter)
  return formatScore(score)
}

function topPlayerColor(orientation: 'white' | 'black', slot: 'top' | 'bottom'): 'w' | 'b' {
  const whiteOnTop = orientation === 'black'
  if (slot === 'top') return whiteOnTop ? 'w' : 'b'
  return whiteOnTop ? 'b' : 'w'
}

function invertForBlack(score: EngineScore): EngineScore {
  return { type: score.type, value: -score.value, bound: score.bound }
}
