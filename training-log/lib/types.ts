// Set shapes by exercise type:
//   W  weight and reps, optional RPE      { w, r, rpe? }
//   R  reps only, optional RPE            { r, rpe? }
//   T  time in seconds                    { t }
//   WD weight and distance in feet        { w, d }
//   C  cardio, time and optional miles    { t, d? }
//   X  anything else                      { raw }
export type SetType = 'W' | 'R' | 'T' | 'WD' | 'C' | 'X'

export const SET_TYPES: { type: SetType; label: string }[] = [
  { type: 'W', label: 'Weight and reps' },
  { type: 'R', label: 'Reps only' },
  { type: 'T', label: 'Time' },
  { type: 'WD', label: 'Weight and distance' },
  { type: 'C', label: 'Cardio' },
]

export interface SetEntry {
  id: string
  w?: number | null
  r?: number | null
  rpe?: number | null
  t?: number | null
  d?: number | null
  raw?: string | null
}

export interface Exercise {
  id: string
  name: string
  type: SetType
  sets: SetEntry[]
}

export interface Workout {
  id: string
  date: string // YYYY-MM-DD
  title: string
  exercises: Exercise[]
}

export interface CustomExercise {
  id: string
  name: string
  type: SetType
}

export interface CustomWorkoutItem {
  name: string
  type: SetType
}

export interface CustomWorkout {
  id: string
  name: string
  items: CustomWorkoutItem[]
}

export type Goal = 'strength' | 'muscle' | 'endurance'

export interface Settings {
  goal: Goal
}

export interface TrainingData {
  workouts: Workout[]
  custom: CustomExercise[]
  customWorkouts: CustomWorkout[]
  settings: Settings
}

export const EMPTY_DATA: TrainingData = {
  workouts: [],
  custom: [],
  customWorkouts: [],
  settings: { goal: 'muscle' },
}
