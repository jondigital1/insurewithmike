import { groupOf } from './exercises'
import type { Goal, SetEntry, SetType } from './types'

// A set is done when the fields that matter for its type have something in them.
// Half a set is not a set, and should not start the clock.
export function isFullSet(set: SetEntry, type: SetType): boolean {
  switch (type) {
    case 'W':
      return set.w != null && set.r != null
    case 'R':
      return set.r != null
    case 'T':
      return set.t != null
    case 'WD':
      return set.w != null && set.d != null
    case 'C':
      return set.t != null
    default:
      return !!set.raw
  }
}

const COMPOUND = [
  'Squat', 'Deadlift', 'Press', 'Row', 'Pull Up', 'Chin Up', 'Pulldown', 'Dip', 'Lunge',
  'Leg Press', 'Hip Thrust', 'Good Morning', 'Rack Pull', 'High Pull', 'Step Up', 'Carry',
]

// Big movements need longer, and the arms and calves at the end of a session do
// not. Rough, but it is a starting number the user can push around.
export function isCompound(name: string): boolean {
  if (/Fly|Raise|Curl|Extension|Pushdown|Kickback|Shrug|Crunch|Pullover/i.test(name)) return false
  return COMPOUND.some((word) => name.includes(word))
}

const SMALL_GROUPS = ['Biceps', 'Triceps', 'Forearms', 'Calves', 'Core', 'Traps']

// Seconds. Strength work needs the rest to be able to repeat the effort, muscle
// work is the middle, endurance is short by definition.
export function restFor(name: string, type: SetType, goal: Goal): number {
  if (type === 'C') return 0
  const big = isCompound(name)
  const small = SMALL_GROUPS.includes(groupOf(name) ?? '')

  if (goal === 'strength') return big ? 240 : 150
  if (goal === 'endurance') return small ? 45 : 60
  if (big) return 150
  return small ? 75 : 105
}

export interface RestState {
  exerciseId: string
  name: string
  endsAt: number
  total: number
}

export const REST_KEY = 'training-log-rest'
