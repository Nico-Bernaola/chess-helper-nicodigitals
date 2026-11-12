import type { AccuracySummary, Color } from '../types'
import { LABEL_ORDER, LABEL_STYLES } from '../review/labels'
import { LabelBadge } from './MoveList'

interface AccuracyPanelProps {
  white: AccuracySummary
  black: AccuracySummary
  whiteName: string
  blackName: string
}

/**
 * Per-player accuracy plus the distribution of labels.
 *
 * Accuracy is the mean of the per-move accuracy curve, so a single blunder in a
 * short game has the same weight it has in a real review.
 */
export function AccuracyPanel({ white, black, whiteName, blackName }: AccuracyPanelProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">Accuracy</h2>
      </header>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        <PlayerAccuracy summary={white} name={whiteName} color="w" />
        <PlayerAccuracy summary={black} name={blackName} color="b" />
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-1.5 pb-1.5 text-[10px] uppercase tracking-[0.07em] text-text-dim [&>span:not(:first-child)]:text-right [&>span:not(:first-child)]:text-[11px] [&>span:not(:first-child)]:normal-case [&>span:not(:first-child)]:tracking-[0.01em] [&>span]:truncate">
          <span />
          <span title={whiteName}>
            {shortName(whiteName)}
          </span>
          <span title={blackName}>
            {shortName(blackName)}
          </span>
        </div>
        {LABEL_ORDER.map((label) => (
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-1.5 py-[3px] text-xs" key={label}>
            <span className="flex min-w-0 items-center gap-2 text-text-muted [&>span:last-child]:truncate">
              <LabelBadge label={label} compact />
              <span>{LABEL_STYLES[label].name}</span>
            </span>
            <span className="text-right font-mono tabular-nums text-text-muted">{white.counts[label]}</span>
            <span className="text-right font-mono tabular-nums text-text-muted">{black.counts[label]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlayerAccuracy({ summary, name, color }: { summary: AccuracySummary; name: string; color: Color }) {
  return (
    <div className="flex flex-col gap-[3px] rounded-lg border border-border bg-bg-elevated p-3">
      <span className={`mb-1 h-[3px] w-[22px] rounded-sm ${color === 'w' ? 'bg-[#eef2f6]' : 'bg-[#3a424c]'}`} />
      <div className="text-[26px] font-bold tracking-[-0.02em] tabular-nums">{summary.accuracy.toFixed(1)}</div>
      <div className="truncate text-[13px] font-semibold">{name}</div>
      <div className="text-[11px] text-text-dim">{summary.moves} moves</div>
    </div>
  )
}

/**
 * Compact name for the breakdown header.
 *
 * PGN tags use `Last, First`, so the surname alone identifies the player and
 * fits the narrow count columns without an ellipsis. Anything else falls back
 * to a truncated full name, which the CSS ellipsis then finishes.
 */
function shortName(name: string): string {
  const surname = name.split(',')[0].trim()
  const candidate = surname || name
  return candidate.length > 14 ? `${candidate.slice(0, 13)}…` : candidate
}
