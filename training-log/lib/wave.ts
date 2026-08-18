import { isEmptySet } from './format'
import type { Profile } from './onboarding'
import type { Workout } from './types'

// The three week effort wave from his program: build at two in reserve, push at
// one, then a week that goes to the end. It runs on repeat.
export interface WaveWeek {
  index: 1 | 2 | 3
  name: string
  rir: string
  rpe: [number, number]
  note: string
}

export const WAVE: WaveWeek[] = [
  {
    index: 1,
    name: 'Build',
    rir: '2 in reserve',
    rpe: [7.5, 8.5],
    note: 'Leave two in the tank. This week is about the work, not the grind.',
  },
  {
    index: 2,
    name: 'Push',
    rir: '1 in reserve',
    rpe: [8.5, 9.5],
    note: 'One left on the last set of each movement. No more than that.',
  },
  {
    index: 3,
    name: 'Send',
    rir: 'to failure',
    rpe: [9.5, 10],
    note: 'Last set of each movement goes until it stops moving. Then the wave restarts.',
  },
]

export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// Which week of the wave today falls in, counted from the week the wave was
// started. Null when the wave is off.
export function waveWeek(profile: Profile, today: string): WaveWeek | null {
  if (!profile.wave) return null
  const start = mondayOf(profile.waveStart ?? today)
  const weeks = Math.floor(
    (new Date(mondayOf(today) + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) /
      (7 * 86400000),
  )
  if (weeks < 0) return WAVE[0]
  return WAVE[weeks % 3]
}

export interface WaveRead {
  logged: number
  average: number | null
  verdict: 'on' | 'under' | 'over' | null
}

// What the RPE actually written down this week says about whether the week was
// run as intended. Only weighted and rep work carries an RPE.
export function readWave(workouts: Workout[], week: WaveWeek, today: string): WaveRead {
  const start = mondayOf(today)
  const values: number[] = []
  for (const w of workouts) {
    if (w.date < start || w.date > today) continue
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (isEmptySet(s, ex.type) || s.rpe == null) continue
        values.push(s.rpe)
      }
    }
  }
  if (!values.length) return { logged: 0, average: null, verdict: null }
  const average = values.reduce((a, b) => a + b, 0) / values.length
  const [lo, hi] = week.rpe
  return {
    logged: values.length,
    average: Math.round(average * 10) / 10,
    verdict: average < lo ? 'under' : average > hi ? 'over' : 'on',
  }
}
