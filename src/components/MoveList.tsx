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
    const container = containerRef.current
    if (!container) return

    const active = container.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) return

    // Scroll only this container, never the page. `scrollIntoView` bubbles up
    // and would drag the window along with it whenever the list sits below the
    // fold, which yanks the board out of view on every Previous/Next press.
    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const header = container.querySelector<HTMLElement>('[data-move-header]')
    const visibleTop = containerRect.top + (header?.getBoundingClientRect().height ?? 0)

    if (activeRect.top < visibleTop) {
      container.scrollTop -= visibleTop - activeRect.top
    } else if (activeRect.bottom > containerRect.bottom) {
      container.scrollTop += activeRect.bottom - containerRect.bottom
    }
  }, [selectedPly])

  if (reviews.length === 0) {
    return (
      <div className="max-h-[460px] overflow-y-auto rounded-xl border border-border bg-bg-panel px-[22px] py-4 text-[13px] text-text-dim">
        <p>Moves appear here as the engine analyses the game.</p>
      </div>
    )
  }

  return (
    <div className="max-h-[460px] overflow-y-auto rounded-xl border border-border bg-bg-panel px-1.5 py-2 min-[421px]:p-2.5" ref={containerRef}>
      <div data-move-header className="move-grid sticky top-0 z-1 bg-bg-panel pb-2 pt-1 text-[11px] uppercase tracking-[0.08em] text-text-dim [&>span:nth-child(3)]:pl-2 [&>span:nth-child(5)]:pl-2">
        <span className="pl-1.5 pr-0 text-left min-[421px]:pl-2.5">#</span>
        <span aria-hidden="true" />
        <span>White</span>
        <span aria-hidden="true" />
        <span>Black</span>
        <span aria-hidden="true" />
      </div>

      {rows.map((row) => (
        <div className="move-grid rounded-lg hover:bg-white/2" key={row.moveNumber}>
          <span className="pl-1.5 pr-0 text-left font-mono text-xs text-text-dim min-[421px]:pl-2.5">{row.moveNumber}</span>
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
  if (!review) return <span className="move-cell cursor-default pl-[11px] text-text-dim">·</span>

  const active = selectedPly === review.ply + 1
  const style = LABEL_STYLES[review.label]

  return (
    <button
      type="button"
      className={`move-cell ${active ? 'border-[#8ab4f8]/40 bg-[#8ab4f8]/14' : ''}`}
      onClick={() => onSelect(review.ply + 1)}
      data-active={active}
      title={`${review.san} · ${style.name} · win chance ${Math.round(review.winChanceAfter * 100)}%`}
    >
      <span className="min-w-0 truncate font-mono text-[13px]">{review.san}</span>
      <LabelBadge label={review.label} />
    </button>
  )
}

export function LabelBadge({ label, compact = false }: { label: MoveLabel; compact?: boolean }) {
  const style = LABEL_STYLES[label]
  return (
    <span
      className={`badge justify-self-center ${compact ? 'h-[18px] min-w-[18px] text-[9px]' : ''}`}
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
