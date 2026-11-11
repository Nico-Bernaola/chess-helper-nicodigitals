import { describe, expect, it } from 'vitest'
import {
  accuracyFromWinChanceLoss,
  formatScore,
  scoreToCp,
  winChanceFromCp,
  winChanceFromScore,
} from './winChance'

describe('winChanceFromCp', () => {
  it('is symmetric around 0', () => {
    expect(winChanceFromCp(0)).toBeCloseTo(0.5, 6)
    expect(winChanceFromCp(400) + winChanceFromCp(-400)).toBeCloseTo(1, 6)
  })

  it('matches the reference points of the formula', () => {
    expect(winChanceFromCp(400)).toBeCloseTo(0.909, 3)
    expect(winChanceFromCp(-400)).toBeCloseTo(0.0909, 3)
    expect(winChanceFromCp(200)).toBeCloseTo(0.7597, 3)
  })

  it('is monotonic and bounded', () => {
    let previous = -1
    for (let cp = -2000; cp <= 2000; cp += 50) {
      const value = winChanceFromCp(cp)
      expect(value).toBeGreaterThan(previous)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
    }
  })
})

describe('winChanceFromScore', () => {
  it('saturates on mate scores', () => {
    expect(winChanceFromScore({ type: 'mate', value: 3 })).toBe(1)
    expect(winChanceFromScore({ type: 'mate', value: -2 })).toBe(0)
  })

  it('delegates centipawn scores', () => {
    expect(winChanceFromScore({ type: 'cp', value: 0 })).toBe(0.5)
  })
})

describe('scoreToCp', () => {
  it('keeps centipawns untouched', () => {
    expect(scoreToCp({ type: 'cp', value: 37 })).toBe(37)
  })

  it('ranks faster mates higher', () => {
    const mateIn1 = scoreToCp({ type: 'mate', value: 1 })
    const mateIn5 = scoreToCp({ type: 'mate', value: 5 })
    expect(mateIn1).toBeGreaterThan(mateIn5)
  })

  it('keeps mates above any normal evaluation', () => {
    expect(scoreToCp({ type: 'mate', value: 100 })).toBeGreaterThan(5000)
    expect(scoreToCp({ type: 'mate', value: -1 })).toBeLessThan(-5000)
  })
})

describe('formatScore', () => {
  it('formats from White point of view', () => {
    expect(formatScore({ type: 'cp', value: 124 })).toBe('+1.24')
    expect(formatScore({ type: 'cp', value: -35 })).toBe('-0.35')
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00')
    expect(formatScore({ type: 'mate', value: -3 })).toBe('-M3')
  })
})

describe('accuracyFromWinChanceLoss', () => {
  it('gives full accuracy for a perfect move', () => {
    expect(accuracyFromWinChanceLoss(0)).toBe(100)
  })

  it('decreases with larger losses', () => {
    const values = [0.01, 0.05, 0.1, 0.2, 0.4].map(accuracyFromWinChanceLoss)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1])
    }
  })

  it('floors at zero', () => {
    expect(accuracyFromWinChanceLoss(1)).toBe(0)
  })
})
