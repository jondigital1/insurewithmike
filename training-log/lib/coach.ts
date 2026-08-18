import type { Goal, SetEntry, SetType } from './types'

export interface GoalSpec {
  id: Goal
  label: string
  reps: [number, number]
  rpe: [number, number]
}

export const GOALS: GoalSpec[] = [
  { id: 'strength', label: 'Strength', reps: [3, 6], rpe: [7, 9] },
  { id: 'muscle', label: 'Muscle', reps: [6, 12], rpe: [7, 9] },
  { id: 'endurance', label: 'Endurance', reps: [12, 20], rpe: [6, 8] },
]

export function goalSpec(goal: Goal): GoalSpec {
  return GOALS.find((g) => g.id === goal) ?? GOALS[1]
}

// Gym plates: 2.5 lb steps under 100, 5 lb steps at 100 and above.
export function roundLoad(w: number): number {
  const step = w < 100 ? 2.5 : 5
  return Math.max(step, Math.round(w / step) * step)
}

const UP = 1.05
const DOWN = 0.925

// A drop cuts 10 to 30 percent; 20 is the middle of the road and lands on a
// weight the plates can actually make.
export function dropFrom(w: number): number {
  return roundLoad(w * 0.8)
}

// Reads the last set of an exercise and says what to do next time. Returns null
// when the set is inside target and there is nothing worth saying.
export function coach(
  set: SetEntry | undefined,
  type: SetType,
  goal: Goal,
  rpeBand?: [number, number],
): string | null {
  if (!set) return null
  if (type !== 'W' && type !== 'R') return null

  const spec = goalSpec(goal)
  const [repLo, repHi] = spec.reps
  const [rpeLo, rpeHi] = rpeBand ?? spec.rpe
  const reps = set.r ?? null
  const rpe = set.rpe ?? null
  const weight = set.w ?? null

  if (rpe != null) {
    if (rpe > rpeHi) {
      if (reps != null && reps > repLo) return `RPE ${fmt(rpe)}, over target. Hold the load, drop to ${reps - 1}`
      if (type === 'W' && weight) return `RPE ${fmt(rpe)}, over target. Try ${fmt(roundLoad(weight * DOWN))}`
      return `RPE ${fmt(rpe)}, over target. Take the reps down`
    }
    if (rpe < rpeLo) {
      if (reps != null && reps < repHi) return `RPE ${fmt(rpe)}, under target. Same load for ${reps + 1}`
      if (type === 'W' && weight) return `RPE ${fmt(rpe)}, under target. Try ${fmt(roundLoad(weight * UP))}`
      return `RPE ${fmt(rpe)}, under target. Add reps`
    }
    if (reps != null && reps >= repHi && type === 'W' && weight) {
      return `Top of the range at RPE ${fmt(rpe)}. Try ${fmt(roundLoad(weight * UP))} for ${repLo}`
    }
    return null
  }

  if (reps == null) return null
  if (reps > repHi && type === 'W' && weight) return `${reps} reps is past ${repHi}. Try ${fmt(roundLoad(weight * UP))}`
  if (reps < repLo && type === 'W' && weight) return `${reps} reps is under ${repLo}. Try ${fmt(roundLoad(weight * DOWN))}`
  return null
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}
