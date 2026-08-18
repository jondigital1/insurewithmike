import { fmtNum } from './format'
import type { Workout } from './types'

const HEADERS = ['date', 'workout', 'exercise', 'type', 'set', 'weight', 'reps', 'rpe', 'seconds', 'distance', 'note']

function cell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = typeof value === 'number' ? fmtNum(value) : value
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// One row per set, oldest first. Opens in anything.
export function toCsv(workouts: Workout[]): string {
  const rows = [HEADERS.join(',')]
  const ordered = workouts.slice().sort((a, b) => a.date.localeCompare(b.date))
  for (const w of ordered) {
    for (const ex of w.exercises) {
      ex.sets.forEach((s, i) => {
        rows.push(
          [
            w.date,
            w.title,
            ex.name,
            ex.type,
            i + 1,
            s.w ?? null,
            s.r ?? null,
            s.rpe ?? null,
            s.t ?? null,
            s.d ?? null,
            s.raw ?? null,
          ]
            .map(cell)
            .join(','),
        )
      })
    }
  }
  return rows.join('\n')
}
