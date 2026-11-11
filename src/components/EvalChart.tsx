import { useMemo } from 'react'
import type { MoveReview } from '../types'
import { LABEL_STYLES } from '../review/labels'

interface EvalChartProps {
  reviews: MoveReview[]
  /** Currently selected ply (0 = start). */
  selectedPly: number
  onSelect: (ply: number) => void
  /** Final evaluation in White's frame, used to close the curve. */
  totalPlies: number
}

const WIDTH = 1000
const HEIGHT = 220
const PAD_Y = 12

/**
 * Win-chance timeline from White's perspective.
 *
 * The y axis is win probability (0..1) rather than raw centipawns: that keeps
 * the curve readable and makes mating lines visually decisive. The area above
 * 50 % is White's, below is Black's, and each move is tinted with its label so
 * mistakes are visible at a glance.
 */
export function EvalChart({ reviews, selectedPly, onSelect, totalPlies }: EvalChartProps) {
  const points = useMemo(() => buildPoints(reviews, totalPlies), [reviews, totalPlies])
  const areaPath = useMemo(() => buildArea(points), [points])
  const linePath = useMemo(() => buildLine(points), [points])
  const selected = points.find((point) => point.ply === selectedPly)

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Evaluation graph"
        className="chart__svg"
      >
        <defs>
          <linearGradient id="chart-white" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7f7f2" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#f7f7f2" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#12161d" />
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="#3b4552" strokeDasharray="4 6" />

        {points.length > 1 && <path d={areaPath} fill="url(#chart-white)" />}
        {points.length > 1 && <path d={linePath} fill="none" stroke="#e9eef5" strokeWidth="2" />}

        {points.map((point) => (
          <circle
            key={`dot-${point.ply}`}
            cx={point.x}
            cy={point.y}
            r={point.ply === selectedPly ? 5 : 2.4}
            fill={point.color}
            stroke={point.ply === selectedPly ? '#ffffff' : 'transparent'}
            strokeWidth="2"
          />
        ))}

        {selected && (
          <line
            x1={selected.x}
            y1={0}
            x2={selected.x}
            y2={HEIGHT}
            stroke="#8ab4f8"
            strokeWidth="2"
            strokeDasharray="3 4"
          />
        )}

        {points.map((point) => (
          <rect
            key={`hit-${point.ply}`}
            x={point.x - WIDTH / Math.max(points.length * 2, 1)}
            y={0}
            width={Math.max(WIDTH / Math.max(points.length - 1, 1), 4)}
            height={HEIGHT}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(point.ply)}
          >
            <title>{point.title}</title>
          </rect>
        ))}
      </svg>

      <div className="chart__legend">
        <span className="chart__legend-item">
          <span aria-hidden="true">●</span> White
        </span>
        <span className="chart__legend-item chart__legend-item--muted">
          Click the graph to jump to a move
        </span>
      </div>
    </div>
  )
}

interface ChartPoint {
  ply: number
  x: number
  y: number
  winChance: number
  color: string
  title: string
}

function buildPoints(reviews: MoveReview[], totalPlies: number): ChartPoint[] {
  if (reviews.length === 0) {
    return [{ ply: 0, x: 0, y: HEIGHT / 2, winChance: 0.5, color: '#7d8b9b', title: 'Start position' }]
  }

  const plies = Math.max(totalPlies, 1)
  const stepX = WIDTH / plies

  // `winChanceBefore/After` are relative to the mover, so convert once to the
  // White frame used by the chart's y axis.
  const first = reviews[0]
  const startChance = whiteChance(first.winChanceBefore, first.color)

  const points: ChartPoint[] = [
    {
      ply: 0,
      x: 0,
      y: winChanceToY(startChance),
      winChance: startChance,
      color: '#7d8b9b',
      title: `Start · ${formatPercent(startChance)} White`,
    },
  ]

  for (const review of reviews) {
    const whiteWinChance = whiteChance(review.winChanceAfter, review.color)
    const style = LABEL_STYLES[review.label]
    points.push({
      ply: review.ply + 1,
      x: (review.ply + 1) * stepX,
      y: winChanceToY(whiteWinChance),
      winChance: whiteWinChance,
      color: style.color,
      title: `${review.moveNumber}${review.color === 'w' ? '.' : '...'} ${review.san} · ${style.name} · ${formatPercent(whiteWinChance)} White`,
    })
  }

  return points
}

function whiteChance(moverChance: number, mover: 'w' | 'b'): number {
  return mover === 'w' ? moverChance : 1 - moverChance
}

function buildLine(points: ChartPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

function buildArea(points: ChartPoint[]): string {
  if (points.length === 0) return ''
  const baseline = HEIGHT - PAD_Y
  const line = buildLine(points)
  const first = points[0]
  const last = points[points.length - 1]
  return `${line} L${last.x.toFixed(2)},${baseline} L${first.x.toFixed(2)},${baseline} Z`
}

function winChanceToY(whiteWinChance: number): number {
  const clamped = Math.min(1, Math.max(0, whiteWinChance))
  return PAD_Y + (1 - clamped) * (HEIGHT - PAD_Y * 2)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
