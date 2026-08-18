import { e1rm } from './gamify'
import { fmtSet, isEmptySet, topSet } from './format'
import type { SetEntry, SetType, Workout } from './types'

export interface Point {
  date: string
  value: number
  label: string
}

export interface Series {
  name: string
  type: SetType
  metric: string
  unit: string
  points: Point[]
  best: number
  latest: number
  change: number | null
}

// What counts as progress depends on the movement. Weighted work uses the
// estimated max so a rep added at the same load registers, everything else uses
// the thing it is measured in.
export const METRIC: Record<string, { metric: string; unit: string }> = {
  W: { metric: 'Estimated max', unit: 'lb' },
  R: { metric: 'Best set', unit: 'reps' },
  T: { metric: 'Longest hold', unit: 's' },
  WD: { metric: 'Heaviest carry', unit: 'lb' },
  C: { metric: 'Longest', unit: 's' },
}

function valueOf(type: SetType, set: SetEntry): number | null {
  if (type === 'W') return e1rm(set)
  if (type === 'R') return set.r ?? null
  if (type === 'T' || type === 'C') return set.t ?? null
  if (type === 'WD') return set.w ?? null
  return null
}

// One point per day, not per workout: two sessions on the same date are one
// point at the better of them, or the line doubles back on itself.
export function seriesFor(workouts: Workout[], name: string): Series | null {
  const byDate = new Map<string, Point>()
  let type: SetType = 'W'

  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.name !== name) continue
      const filled = ex.sets.filter((s) => !isEmptySet(s, ex.type))
      if (!filled.length) continue
      type = ex.type
      const best = topSet({ ...ex, sets: filled })
      const value = best ? valueOf(ex.type, best) : null
      if (best == null || value == null) continue
      const point: Point = { date: w.date, value: Math.round(value * 10) / 10, label: fmtSet(best, ex.type) }
      const existing = byDate.get(w.date)
      if (!existing || point.value > existing.value) byDate.set(w.date, point)
    }
  }

  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const first = values[0]
  const latest = values[values.length - 1]
  return {
    name,
    type,
    metric: METRIC[type]?.metric ?? 'Best',
    unit: METRIC[type]?.unit ?? '',
    points,
    best: Math.max(...values),
    latest,
    change: first > 0 ? Math.round(((latest - first) / first) * 1000) / 10 : null,
  }
}

// Movements ranked by how often they have been logged, so the three numbers
// somebody actually tracks rise to the top without being told which they are.
export function trackedNames(workouts: Workout[]): string[] {
  const counts = new Map<string, Set<string>>()
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!ex.sets.some((s) => !isEmptySet(s, ex.type))) continue
      if (!counts.has(ex.name)) counts.set(ex.name, new Set())
      counts.get(ex.name)!.add(w.date)
    }
  }
  return [...counts.entries()]
    .filter(([, dates]) => dates.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([name]) => name)
}
