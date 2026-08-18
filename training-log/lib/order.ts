import { groupOf } from './exercises'
import { e1rm } from './gamify'
import { isEmptySet } from './format'
import { isCompound } from './rest'
import { groupRuns } from './superset'
import type { Exercise, SetType, Workout } from './types'

// Big before small, multi joint before single joint, heavy before light. This is
// the sequencing rule from ACSM's progression stand, and the reason for it is
// that the hardest thing you do should meet you fresh, not after twenty sets of
// arms.

const LARGE = ['Back', 'Chest', 'Quads', 'Hamstrings', 'Glutes']
const MEDIUM = ['Shoulders', 'Traps', 'Carries', 'Cardio']

export function groupSize(name: string): number {
  const group = groupOf(name)
  if (!group) return 1
  if (LARGE.includes(group)) return 3
  if (MEDIUM.includes(group)) return 2
  return 1
}

// The heaviest this person has actually handled on each movement. Their own
// numbers beat any guess about what counts as heavy.
export function topLoads(workouts: Workout[]): Map<string, number> {
  const loads = new Map<string, number>()
  for (const w of workouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (isEmptySet(s, ex.type)) continue
        const value = ex.type === 'W' ? (e1rm(s) ?? s.w ?? 0) : (s.w ?? 0)
        if (value > (loads.get(ex.name) ?? 0)) loads.set(ex.name, value)
      }
    }
  }
  return loads
}

export interface Ranked {
  compound: number
  size: number
  load: number
}

export function rank(name: string, type: SetType, loads?: Map<string, number>): Ranked {
  return {
    compound: isCompound(name) ? 1 : 0,
    size: type === 'T' || type === 'C' ? 0 : groupSize(name),
    load: loads?.get(name) ?? 0,
  }
}

function compare(a: Ranked, b: Ranked): number {
  return b.compound - a.compound || b.size - a.size || b.load - a.load
}

// Sorts whole supersets rather than individual movements, ranked by the hardest
// thing inside them, so a pair stays a pair.
export function hardestFirst(exercises: Exercise[], loads?: Map<string, number>): Exercise[] {
  const runs = groupRuns(exercises).map((run, index) => ({
    run,
    index,
    key: run.exercises
      .map((e) => rank(e.name, e.type, loads))
      .reduce((best, r) => (compare(r, best) < 0 ? r : best)),
  }))

  runs.sort((a, b) => compare(a.key, b.key) || a.index - b.index)
  return runs.flatMap((r) => r.run.exercises)
}

export function isHardestFirst(exercises: Exercise[], loads?: Map<string, number>): boolean {
  const sorted = hardestFirst(exercises, loads)
  return sorted.every((e, i) => e.id === exercises[i].id)
}

// Moving a superset moves the whole thing, because half a superset in a new
// place is not a thing anybody meant to do.
export function moveRun(exercises: Exercise[], exerciseId: string, direction: -1 | 1): Exercise[] {
  const runs = groupRuns(exercises)
  const from = runs.findIndex((r) => r.exercises.some((e) => e.id === exerciseId))
  const to = from + direction
  if (from < 0 || to < 0 || to >= runs.length) return exercises
  const next = [...runs]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next.flatMap((r) => r.exercises)
}
