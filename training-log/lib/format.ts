import type { Exercise, SetEntry, SetType, Workout } from './types'

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

export function fmtSet(set: SetEntry, type: SetType): string {
  const rpe = set.rpe != null ? ` @${fmtNum(set.rpe)}` : ''
  switch (type) {
    case 'W':
      return `${set.w != null ? fmtNum(set.w) : '?'} x ${set.r ?? '?'}${rpe}`
    case 'R':
      return `${set.r ?? '?'}${rpe}`
    case 'T':
      return set.t != null ? fmtTime(set.t) : '?'
    case 'WD':
      return `${set.w != null ? fmtNum(set.w) : '?'} x ${set.d != null ? fmtNum(set.d) : '?'} ft`
    case 'C': {
      const t = set.t != null ? fmtTime(set.t) : '?'
      return set.d != null ? `${t}, ${fmtNum(set.d)} mi` : t
    }
    default:
      return set.raw ?? ''
  }
}

export function fmtSets(exercise: Exercise): string {
  let out = ''
  for (const s of exercise.sets) {
    if (!out) out = fmtSet(s, exercise.type)
    else if (s.drop) out += ` drop ${fmtSet(s, exercise.type)}`
    else out += `, ${fmtSet(s, exercise.type)}`
  }
  return out
}

export function isEmptySet(set: SetEntry, type: SetType): boolean {
  switch (type) {
    case 'W':
      return set.w == null && set.r == null
    case 'R':
      return set.r == null
    case 'T':
      return set.t == null
    case 'WD':
      return set.w == null && set.d == null
    case 'C':
      return set.t == null && set.d == null
    default:
      return !set.raw
  }
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
}

// Volume in pounds, used by the history summary. Only weighted work counts.
export function workoutVolume(workout: Workout): number {
  let total = 0
  for (const ex of workout.exercises) {
    if (ex.type !== 'W') continue
    for (const set of ex.sets) {
      if (set.w != null && set.r != null) total += set.w * set.r
    }
  }
  return total
}

// Best set of an exercise, heaviest load then most reps. Drives PR detection
// and the progression chart.
export function topSet(exercise: Exercise): SetEntry | null {
  let best: SetEntry | null = null
  for (const set of exercise.sets) {
    if (set.drop) continue
    if (exercise.type === 'W') {
      if (set.w == null) continue
      if (!best || set.w > (best.w ?? 0) || (set.w === best.w && (set.r ?? 0) > (best.r ?? 0))) best = set
    } else if (exercise.type === 'R') {
      if (set.r == null) continue
      if (!best || (set.r ?? 0) > (best.r ?? 0)) best = set
    } else if (exercise.type === 'T' || exercise.type === 'C') {
      if (set.t == null) continue
      if (!best || (set.t ?? 0) > (best.t ?? 0)) best = set
    } else if (exercise.type === 'WD') {
      if (set.w == null && set.d == null) continue
      if (!best || (set.w ?? 0) * (set.d ?? 0) > (best.w ?? 0) * (best.d ?? 0)) best = set
    }
  }
  return best
}

export function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Accepts "90", "1:30" or "1:02:00" and returns seconds.
export function parseClock(text: string): number | null {
  const s = text.trim()
  if (!s) return null
  if (!/^[\d:.]+$/.test(s)) return null
  const parts = s.split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n))) return null
  if (parts.length === 1) return Math.round(parts[0])
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
  return null
}
