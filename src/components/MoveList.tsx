import { useEffect, useRef } from 'react'
import type { MoveLabel, MoveReview } from '../types'
import { LABEL_STYLES } from '../review/labels'

interface MoveListProps {
  reviews: MoveReview[]
  selectedPly: number
  onSelect: (ply: number) => void
}

interface MoveRow {
  moveNumber: number
  white: MoveReview | null
  black: MoveReview | null
}

/**
 * Two-column move table (White / Black) with label badges.
 *
 * Rows are grouped by move number and rendered in a scroll container that
 * auto-follows the selected ply while the analysis loop advances.
 */
export function MoveList({ reviews, selectedPly, onSelect }: MoveListProps) {
  const rows = groupByMoveNumber(reviews)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const active = containerRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [selectedPly])

  if (reviews.length === 0) {
    return (
      <div className="move-list move-list--empty">
        <p>Moves appear here as the engine analyses the game.</p>
      </div>
    )
  }

  return (
    <div className="move-list" ref={containerRef}>
      <div className="move-list__header">
        <span className="move-list__number-head">#</span>
        <span aria-hidden="true" />
        <span>White</span>
        <span aria-hidden="true" />
        <span>Black</span>
        <span aria-hidden="true" />
      </div>

      {rows.map((row) => (
        <div className="move-list__row" key={row.moveNumber}>
          <span className="move-list__number">{row.moveNumber}</span>
          <span aria-hidden="true" />
          <MoveCell review={row.white} selectedPly={selectedPly} onSelect={onSelect} />
          <span aria-hidden="true" />
          <MoveCell review={row.black} selectedPly={selectedPly} onSelect={onSelect} />
          <span aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}

interface MoveCellProps {
  review: MoveReview | null
  selectedPly: number
  onSelect: (ply: number) => void
}

function MoveCell({ review, selectedPly, onSelect }: MoveCellProps) {
  if (!review) return <span className="move-list__cell move-list__cell--empty">·</span>

  const active = selectedPly === review.ply + 1
  const style = LABEL_STYLES[review.label]

  return (
    <button
      type="button"
      className={`move-list__cell${active ? ' is-active' : ''}`}
      onClick={() => onSelect(review.ply + 1)}
      data-active={active}
      title={`${review.san} · ${style.name} · win chance ${Math.round(review.winChanceAfter * 100)}%`}
    >
      <span className="move-list__san">{review.san}</span>
      <LabelBadge label={review.label} />
    </button>
  )
}

export function LabelBadge({ label, compact = false }: { label: MoveLabel; compact?: boolean }) {
  const style = LABEL_STYLES[label]
  return (
    <span
      className={`badge${compact ? ' badge--compact' : ''}`}
      style={{ backgroundColor: style.color, color: style.textColor }}
      aria-label={style.name}
      title={style.description}
    >
      {style.glyph}
    </span>
  )
}

function groupByMoveNumber(reviews: MoveReview[]): MoveRow[] {
  const rows = new Map<number, MoveRow>()

  for (const review of reviews) {
    let row = rows.get(review.moveNumber)
    if (!row) {
      row = { moveNumber: review.moveNumber, white: null, black: null }
      rows.set(review.moveNumber, row)
    }
    if (review.color === 'w') row.white = review
    else row.black = review
  }

  return [...rows.values()].sort((a, b) => a.moveNumber - b.moveNumber)
}
