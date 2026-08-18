import { lookupType } from './exercises'
import { uid } from './format'
import type { CustomWorkoutItem, Goal, SetEntry, SetType, TrainingData, Workout } from './types'

// Parses a v1 set string back into fields. The artifact stored sets as text
// before v2, so "135x8 @8" and "20:00 2.1mi" both have to come apart cleanly.
export function parseSetString(raw: string, type: SetType): SetEntry {
  const set: SetEntry = { id: uid() }
  const text = raw.trim()
  if (!text) return set

  const rpe = text.match(/@\s*(\d+(?:\.\d+)?)/)
  if (rpe) set.rpe = Number(rpe[1])
  const body = text.replace(/@\s*\d+(?:\.\d+)?/, '').trim()

  const clock = body.match(/(\d+):(\d{2})(?::(\d{2}))?/)
  const seconds = clock
    ? clock[3]
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2])
    : null

  const nums = body.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []

  switch (type) {
    case 'W': {
      const pair = body.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+)/)
      if (pair) {
        set.w = Number(pair[1])
        set.r = Number(pair[2])
      } else if (nums.length >= 2) {
        set.w = nums[0]
        set.r = nums[1]
      } else if (nums.length === 1) {
        set.r = nums[0]
      } else {
        set.raw = text
      }
      return set
    }
    case 'R': {
      if (nums.length) set.r = nums[0]
      else set.raw = text
      return set
    }
    case 'T': {
      if (seconds != null) set.t = seconds
      else if (nums.length) set.t = /min/i.test(body) ? nums[0] * 60 : nums[0]
      else set.raw = text
      return set
    }
    case 'WD': {
      const pair = body.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/)
      if (pair) {
        set.w = Number(pair[1])
        set.d = Number(pair[2])
      } else if (nums.length >= 2) {
        set.w = nums[0]
        set.d = nums[1]
      } else set.raw = text
      return set
    }
    case 'C': {
      if (seconds != null) set.t = seconds
      const miles = body.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile)/i)
      if (miles) set.d = Number(miles[1])
      else if (seconds == null && nums.length) set.t = nums[0] * 60
      if (set.t == null && set.d == null) set.raw = text
      return set
    }
    default:
      set.raw = text
      return set
  }
}

function coerceSet(value: unknown, type: SetType): SetEntry {
  if (typeof value === 'string') return parseSetString(value, type)
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    const num = (k: string) => (v[k] == null || v[k] === '' ? null : Number(v[k]))
    return {
      id: uid(),
      w: num('w'),
      r: num('r'),
      rpe: num('rpe'),
      t: num('t'),
      d: num('d'),
      raw: typeof v.raw === 'string' ? v.raw : null,
    }
  }
  return { id: uid() }
}

const VALID_TYPES: SetType[] = ['W', 'R', 'T', 'WD', 'C', 'X']

function coerceType(value: unknown, name: string): SetType {
  if (typeof value === 'string' && VALID_TYPES.includes(value as SetType)) return value as SetType
  return lookupType(name) ?? 'W'
}

// Takes the artifact's exported blob, either the v2 object or the v1
// "workout-log" array, and returns rows this app can write. Every id is minted
// fresh because Postgres wants uuids and the artifact did not use them.
export function importArtifactData(input: unknown): TrainingData {
  const root = typeof input === 'string' ? JSON.parse(input) : input
  const source = (Array.isArray(root) ? { workouts: root } : root ?? {}) as Record<string, any>

  const workouts: Workout[] = (source.workouts ?? []).map((w: Record<string, any>): Workout => {
    const exercises = (w.exercises ?? []).map((ex: Record<string, any>) => {
      const name = String(ex.name ?? 'Exercise')
      const type = coerceType(ex.type, name)
      return {
        id: uid(),
        name,
        type,
        sets: (ex.sets ?? []).map((s: unknown) => coerceSet(s, type)),
      }
    })
    return {
      id: uid(),
      date: String(w.date ?? '').slice(0, 10),
      title: String(w.title ?? 'Workout'),
      exercises,
    }
  })

  const custom = (source.custom ?? []).map((c: Record<string, any>) => {
    const name = String(c.name ?? '')
    return { id: uid(), name, type: coerceType(c.type, name) }
  })

  const customWorkouts = (source.customWorkouts ?? []).map((c: Record<string, any>) => ({
    id: uid(),
    name: String(c.name ?? 'Workout'),
    items: (c.items ?? c.exercises ?? []).map((item: unknown): CustomWorkoutItem => {
      if (typeof item === 'string') return { name: item, type: lookupType(item) ?? 'W' }
      const obj = item as Record<string, any>
      const name = String(obj.name ?? '')
      return { name, type: coerceType(obj.type, name) }
    }),
  }))

  const goal = source.settings?.goal
  const valid: Goal[] = ['strength', 'muscle', 'endurance']

  return {
    workouts: workouts.filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date)),
    custom,
    customWorkouts,
    settings: { goal: valid.includes(goal) ? goal : 'muscle' },
  }
}
