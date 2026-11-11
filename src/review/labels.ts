import type { MoveLabel } from '../types'

export interface LabelStyle {
  id: MoveLabel
  name: string
  /** Single-character badge, mirroring the familiar chess.com glyphs. */
  glyph: string
  color: string
  textColor: string
  description: string
}

export const LABEL_STYLES: Record<MoveLabel, LabelStyle> = {
  brilliant: {
    id: 'brilliant',
    name: 'Brilliant',
    glyph: '!!',
    color: '#26c2a3',
    textColor: '#04231d',
    description: 'A sound sacrifice that keeps or creates a winning position.',
  },
  best: {
    id: 'best',
    name: 'Best',
    glyph: '★',
    color: '#81b64c',
    textColor: '#10240a',
    description: "The engine's top choice.",
  },
  excellent: {
    id: 'excellent',
    name: 'Excellent',
    glyph: '✓',
    color: '#96bc4b',
    textColor: '#13220a',
    description: 'As good as the best move for practical purposes.',
  },
  good: {
    id: 'good',
    name: 'Good',
    glyph: '✓',
    color: '#95af8a',
    textColor: '#16210f',
    description: 'A reasonable move with a small cost.',
  },
  inaccuracy: {
    id: 'inaccuracy',
    name: 'Inaccuracy',
    glyph: '?!',
    color: '#f7c631',
    textColor: '#2a1d00',
    description: 'Lets some of the advantage slip away.',
  },
  mistake: {
    id: 'mistake',
    name: 'Mistake',
    glyph: '?',
    color: '#ffa459',
    textColor: '#2a1000',
    description: 'A clear error that changes the character of the position.',
  },
  blunder: {
    id: 'blunder',
    name: 'Blunder',
    glyph: '??',
    color: '#fa412d',
    textColor: '#2b0400',
    description: 'A serious error that can decide the game.',
  },
}

export const LABEL_ORDER: MoveLabel[] = [
  'brilliant',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]
