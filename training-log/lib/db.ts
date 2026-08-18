import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CustomExercise,
  CustomWorkout,
  Goal,
  SetEntry,
  SetType,
  TrainingData,
  Workout,
} from './types'

type Row = Record<string, any>

const WORKOUT_SELECT =
  'id,date,title,exercises(id,name,type,position,sets(id,position,w,r,rpe,t,d,raw))'

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function rowToWorkout(row: Row): Workout {
  const exercises = (row.exercises ?? [])
    .slice()
    .sort((a: Row, b: Row) => a.position - b.position)
    .map((ex: Row) => ({
      id: ex.id as string,
      name: ex.name as string,
      type: ex.type as SetType,
      sets: (ex.sets ?? [])
        .slice()
        .sort((a: Row, b: Row) => a.position - b.position)
        .map(
          (s: Row): SetEntry => ({
            id: s.id as string,
            w: toNum(s.w),
            r: toNum(s.r),
            rpe: toNum(s.rpe),
            t: toNum(s.t),
            d: toNum(s.d),
            raw: (s.raw as string) ?? null,
          }),
        ),
    }))
  return { id: row.id as string, date: row.date as string, title: row.title as string, exercises }
}

export async function loadAll(sb: SupabaseClient, userId: string): Promise<TrainingData> {
  const [workouts, custom, customWorkouts, settings] = await Promise.all([
    sb.from('workouts').select(WORKOUT_SELECT).order('date', { ascending: false }),
    sb.from('custom_exercises').select('id,name,type').order('name'),
    sb.from('custom_workouts').select('id,name,items').order('created_at'),
    sb.from('settings').select('goal').eq('user_id', userId).maybeSingle(),
  ])

  const err = workouts.error ?? custom.error ?? customWorkouts.error ?? settings.error
  if (err) throw err

  return {
    workouts: (workouts.data ?? []).map(rowToWorkout),
    custom: (custom.data ?? []) as CustomExercise[],
    customWorkouts: (customWorkouts.data ?? []).map((r: Row) => ({
      id: r.id as string,
      name: r.name as string,
      items: Array.isArray(r.items) ? r.items : [],
    })) as CustomWorkout[],
    settings: { goal: ((settings.data?.goal as Goal) ?? 'muscle') },
  }
}

// Writes a whole workout. Exercises and sets are replaced rather than diffed,
// which keeps ordering honest and a session is only ever a handful of rows.
export async function saveWorkout(sb: SupabaseClient, userId: string, workout: Workout) {
  const up = await sb
    .from('workouts')
    .upsert({ id: workout.id, user_id: userId, date: workout.date, title: workout.title })
  if (up.error) throw up.error

  const del = await sb.from('exercises').delete().eq('workout_id', workout.id)
  if (del.error) throw del.error

  if (workout.exercises.length === 0) return

  const exerciseRows = workout.exercises.map((ex, i) => ({
    id: ex.id,
    user_id: userId,
    workout_id: workout.id,
    name: ex.name,
    type: ex.type,
    position: i,
  }))
  const insEx = await sb.from('exercises').insert(exerciseRows)
  if (insEx.error) throw insEx.error

  const setRows = workout.exercises.flatMap((ex) =>
    ex.sets.map((s, i) => ({
      id: s.id,
      user_id: userId,
      exercise_id: ex.id,
      position: i,
      w: s.w ?? null,
      r: s.r ?? null,
      rpe: s.rpe ?? null,
      t: s.t ?? null,
      d: s.d ?? null,
      raw: s.raw ?? null,
    })),
  )
  if (setRows.length === 0) return
  const insSets = await sb.from('sets').insert(setRows)
  if (insSets.error) throw insSets.error
}

export async function deleteWorkout(sb: SupabaseClient, id: string) {
  const res = await sb.from('workouts').delete().eq('id', id)
  if (res.error) throw res.error
}

export async function saveCustomExercise(sb: SupabaseClient, userId: string, ex: CustomExercise) {
  const res = await sb
    .from('custom_exercises')
    .upsert({ id: ex.id, user_id: userId, name: ex.name, type: ex.type }, { onConflict: 'user_id,name' })
  if (res.error) throw res.error
}

export async function deleteCustomExercise(sb: SupabaseClient, id: string) {
  const res = await sb.from('custom_exercises').delete().eq('id', id)
  if (res.error) throw res.error
}

export async function saveCustomWorkout(sb: SupabaseClient, userId: string, w: CustomWorkout) {
  const res = await sb
    .from('custom_workouts')
    .upsert({ id: w.id, user_id: userId, name: w.name, items: w.items })
  if (res.error) throw res.error
}

export async function deleteCustomWorkout(sb: SupabaseClient, id: string) {
  const res = await sb.from('custom_workouts').delete().eq('id', id)
  if (res.error) throw res.error
}

export async function saveGoal(sb: SupabaseClient, userId: string, goal: Goal) {
  const res = await sb.from('settings').upsert({ user_id: userId, goal })
  if (res.error) throw res.error
}
