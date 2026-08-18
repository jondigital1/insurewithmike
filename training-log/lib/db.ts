import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from './onboarding'
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
  'id,date,title,exercises(id,name,type,position,superset,sets(id,position,w,r,rpe,t,d,raw,dropset))'

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
      superset: (ex.superset as string) ?? null,
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
            drop: s.dropset === true ? true : null,
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
    sb.from('settings').select('goal,profile,onboarded_at').eq('user_id', userId).maybeSingle(),
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
    settings: {
      goal: (settings.data?.goal as Goal) ?? 'muscle',
      profile: (settings.data?.profile as Profile) ?? {},
      onboardedAt: (settings.data?.onboarded_at as string) ?? null,
    },
  }
}

// Writes a whole workout in a single call. One request rather than four means a
// save that starts as the app is going away either lands or does not, instead
// of leaving half a session behind. See supabase/migrations/0002_save_workout.sql
export async function saveWorkout(sb: SupabaseClient, _userId: string, workout: Workout) {
  const res = await sb.rpc('save_workout', {
    payload: {
      id: workout.id,
      date: workout.date,
      title: workout.title,
      exercises: workout.exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        type: ex.type,
        superset: ex.superset ?? null,
        sets: ex.sets.map((s) => ({
          id: s.id,
          w: s.w ?? null,
          r: s.r ?? null,
          rpe: s.rpe ?? null,
          t: s.t ?? null,
          d: s.d ?? null,
          raw: s.raw ?? null,
          drop: s.drop === true,
        })),
      })),
    },
  })
  if (res.error) throw res.error
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

export async function saveProfile(
  sb: SupabaseClient,
  userId: string,
  profile: Profile,
  onboardedAt: string | null,
) {
  const res = await sb
    .from('settings')
    .upsert({ user_id: userId, profile, onboarded_at: onboardedAt })
  if (res.error) throw res.error
}
