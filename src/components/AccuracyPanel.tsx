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
    <section className="panel accuracy">
      <header className="panel__header">
        <h2>Accuracy</h2>
      </header>

      <div className="accuracy__scores">
        <PlayerAccuracy summary={white} name={whiteName} color="w" />
        <PlayerAccuracy summary={black} name={blackName} color="b" />
      </div>

      <div className="accuracy__breakdown">
        <div className="accuracy__breakdown-head">
          <span />
          <span className="accuracy__head-name" title={whiteName}>
            {shortName(whiteName)}
          </span>
          <span className="accuracy__head-name" title={blackName}>
            {shortName(blackName)}
          </span>
        </div>
        {LABEL_ORDER.map((label) => (
          <div className="accuracy__row" key={label}>
            <span className="accuracy__row-label">
              <LabelBadge label={label} compact />
              <span>{LABEL_STYLES[label].name}</span>
            </span>
            <span className="accuracy__count">{white.counts[label]}</span>
            <span className="accuracy__count">{black.counts[label]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlayerAccuracy({ summary, name, color }: { summary: AccuracySummary; name: string; color: Color }) {
  return (
    <div className="accuracy__player">
      <span className={`accuracy__swatch accuracy__swatch--${color}`} />
      <div className="accuracy__value">{summary.accuracy.toFixed(1)}</div>
      <div className="accuracy__name">{name}</div>
      <div className="accuracy__moves">{summary.moves} moves</div>
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
