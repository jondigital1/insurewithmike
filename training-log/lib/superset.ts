import { restFor } from './rest'
import type { Exercise, Goal } from './types'

export interface Run {
  superset: string | null
  exercises: Exercise[]
  index: number
}

// Consecutive exercises sharing a tag are one superset. Their order in the list
// is the order they run in, so nothing beyond the tag needs storing. A tag that
// reappears after a gap is a separate superset, because that is what the order
// on screen says it is.
export function groupRuns(exercises: Exercise[]): Run[] {
  const runs: Run[] = []
  let supersets = 0
  for (const exercise of exercises) {
    const previous = runs[runs.length - 1]
    if (previous && exercise.superset && previous.superset === exercise.superset) {
      previous.exercises.push(exercise)
      continue
    }
    runs.push({
      superset: exercise.superset ?? null,
      exercises: [exercise],
      index: exercise.superset ? supersets++ : -1,
    })
  }
  return runs
}

// A run of one is not a superset, whatever it is tagged with.
export function isSuperset(run: Run): boolean {
  return !!run.superset && run.exercises.length > 1
}

// One clock for the group, set by whichever movement in it asks for the most.
export function supersetRest(run: Run, goal: Goal): number {
  return Math.max(...run.exercises.map((e) => restFor(e.name, e.type, goal)))
}

export function supersetLetter(index: number): string {
  return String.fromCharCode(65 + index)
}
