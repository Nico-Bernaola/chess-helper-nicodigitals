import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Chessboard } from 'react-chessboard'
import type { MoveReview, ParsedGame } from '../types'
import { LABEL_STYLES } from '../review/labels'
import { evalForPlayer } from '../review/evalDisplay'
import { displayName } from '../review/describeGame'

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
  pgnInput: ReactNode
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
  pgnInput,
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
  const whiteName = displayName(headers.White, 'White')
  const blackName = displayName(headers.Black, 'Black')

  // Colour of the side rendered on each edge of the board.
  const topColor = orientation === 'white' ? 'b' : 'w'
  const bottomColor = orientation === 'white' ? 'w' : 'b'

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-border bg-bg-panel p-3.5">
      <PlayerBar
        name={topColor === 'w' ? whiteName : blackName}
        color={topColor}
        score={evalForPlayer(topColor, currentReview)}
      />

      <div className="relative aspect-square w-full">
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
        name={bottomColor === 'w' ? whiteName : blackName}
        color={bottomColor}
        score={evalForPlayer(bottomColor, currentReview)}
      />

      <div className="flex items-center gap-1.5">
        <button className="grid h-[34px] w-[38px] cursor-pointer place-items-center rounded-lg border border-border bg-bg-elevated text-[13px] transition-colors duration-[120ms] hover:not-disabled:bg-[#212a34] disabled:cursor-not-allowed disabled:opacity-35" type="button" onClick={() => onNavigate(0)} disabled={ply === 0} title="Start">
          ⏮
        </button>
        <button className="grid h-[34px] w-[38px] cursor-pointer place-items-center rounded-lg border border-border bg-bg-elevated text-[13px] transition-colors duration-[120ms] hover:not-disabled:bg-[#212a34] disabled:cursor-not-allowed disabled:opacity-35" type="button" onClick={() => onNavigate(ply - 1)} disabled={ply === 0} title="Previous move">
          ◀
        </button>
        <span className="min-w-14 text-center font-mono text-xs text-text-muted">
          {ply} / {totalPlies}
        </span>
        <button
          className="grid h-[34px] w-[38px] cursor-pointer place-items-center rounded-lg border border-border bg-bg-elevated text-[13px] transition-colors duration-[120ms] hover:not-disabled:bg-[#212a34] disabled:cursor-not-allowed disabled:opacity-35"
          type="button"
          onClick={() => onNavigate(ply + 1)}
          disabled={ply >= totalPlies}
          title="Next move"
        >
          ▶
        </button>
        <button className="grid h-[34px] w-[38px] cursor-pointer place-items-center rounded-lg border border-border bg-bg-elevated text-[13px] transition-colors duration-[120ms] hover:not-disabled:bg-[#212a34] disabled:cursor-not-allowed disabled:opacity-35" type="button" onClick={() => onNavigate(totalPlies)} disabled={ply >= totalPlies} title="End">
          ⏭
        </button>
        {pgnInput}
        <button className="grid h-[34px] w-[38px] cursor-pointer place-items-center rounded-lg border border-border bg-bg-elevated text-[13px] transition-colors duration-[120ms] hover:not-disabled:bg-[#212a34] disabled:cursor-not-allowed disabled:opacity-35" type="button" onClick={onFlip} title="Flip board">
          ⇅
        </button>
      </div>

      {currentReview && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border-l-[3px] bg-[#121820] px-3 py-[9px] text-[13px]" style={{ borderColor: LABEL_STYLES[currentReview.label].color }}>
          <span className="font-mono font-semibold">
            {currentReview.moveNumber}
            {currentReview.color === 'w' ? '.' : '...'} {currentReview.san}
          </span>
          <span
            className="font-semibold"
            style={{ color: LABEL_STYLES[currentReview.label].color }}
          >
            {LABEL_STYLES[currentReview.label].name}
          </span>
          <span className="ml-auto text-text-muted">
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
    <div className="flex min-h-[26px] items-center gap-[9px] px-1 py-0.5 text-sm">
      <span className="size-[11px] shrink-0 rounded-[3px] border border-[#47535f]" style={{ backgroundColor: PLAYER_COLORS[color] }} />
      <span className="truncate font-semibold">{name}</span>
      {score && <span className="ml-auto rounded-md border border-border bg-[#10151b] px-[7px] py-0.5 font-mono text-xs text-text-muted">{score}</span>}
    </div>
  )
}
