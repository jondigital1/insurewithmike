'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as db from '@/lib/db'
import { fmtDate, fmtSets, today, uid, workoutVolume } from '@/lib/format'
import { supabaseBrowser } from '@/lib/supabase/client'
import CustomBuilder from './CustomBuilder'
import ExercisePicker from './ExercisePicker'
import SettingsSheet from './SettingsSheet'
import StartSheet from './StartSheet'
import WorkoutEditor from './WorkoutEditor'
import type { LastSession } from './ExerciseBlock'
import {
  EMPTY_DATA,
  type CustomExercise,
  type CustomWorkoutItem,
  type Goal,
  type SetType,
  type TrainingData,
  type Workout,
} from '@/lib/types'

type SheetName = 'start' | 'picker' | 'builder' | 'settings' | null

export default function App({ userId, email }: { userId: string; email: string }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [data, setData] = useState<TrainingData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'log' | 'history'>('log')
  const [sheet, setSheet] = useState<SheetName>(null)
  const [pickerTarget, setPickerTarget] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)

  const pending = useRef(new Map<string, Workout>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<TrainingData>(data)
  latest.current = data

  const flush = useCallback(async () => {
    const queue = [...pending.current.values()]
    pending.current.clear()
    for (const workout of queue) {
      try {
        await db.saveWorkout(sb, userId, workout)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed')
        return
      }
    }
    setError('')
  }, [sb, userId])

  // Every edit lands in state immediately and hits Postgres a beat later, so
  // typing a set never waits on the network.
  const queueSave = useCallback(
    (workout: Workout) => {
      pending.current.set(workout.id, workout)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 700)
    },
    [flush],
  )

  useEffect(() => {
    let alive = true
    db.loadAll(sb, userId)
      .then((loaded) => {
        if (alive) setData(loaded)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sb, userId])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush()
    }
  }, [flush])

  const updateWorkout = useCallback(
    (next: Workout) => {
      setData((prev) => ({ ...prev, workouts: prev.workouts.map((w) => (w.id === next.id ? next : w)) }))
      queueSave(next)
    },
    [queueSave],
  )

  async function removeWorkout(id: string) {
    pending.current.delete(id)
    setData((prev) => ({ ...prev, workouts: prev.workouts.filter((w) => w.id !== id) }))
    try {
      await db.deleteWorkout(sb, id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function startWorkout(title: string, items: CustomWorkoutItem[]) {
    const workout: Workout = {
      id: uid(),
      date: today(),
      title,
      exercises: items.map((item) => ({
        id: uid(),
        name: item.name,
        type: item.type,
        sets: [{ id: uid() }],
      })),
    }
    setData((prev) => ({ ...prev, workouts: [workout, ...prev.workouts] }))
    queueSave(workout)
    setSheet(null)
    setTab('log')
  }

  function addExercise(workoutId: string, name: string, type: SetType) {
    const workout = latest.current.workouts.find((w) => w.id === workoutId)
    if (!workout) return
    updateWorkout({
      ...workout,
      exercises: [...workout.exercises, { id: uid(), name, type, sets: [{ id: uid() }] }],
    })
  }

  async function createCustomExercise(exercise: CustomExercise) {
    setData((prev) => ({ ...prev, custom: [...prev.custom, exercise] }))
    try {
      await db.saveCustomExercise(sb, userId, exercise)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save exercise')
    }
  }

  async function saveCustomWorkout(name: string, items: CustomWorkoutItem[]) {
    const workout = { id: uid(), name, items }
    setData((prev) => ({ ...prev, customWorkouts: [...prev.customWorkouts, workout] }))
    setSheet(null)
    try {
      await db.saveCustomWorkout(sb, userId, workout)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save workout')
    }
    startWorkout(name, items)
  }

  async function removeCustomWorkout(id: string) {
    setData((prev) => ({ ...prev, customWorkouts: prev.customWorkouts.filter((w) => w.id !== id) }))
    try {
      await db.deleteCustomWorkout(sb, id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete workout')
    }
  }

  async function setGoal(goal: Goal) {
    setData((prev) => ({ ...prev, settings: { goal } }))
    try {
      await db.saveGoal(sb, userId, goal)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save goal')
    }
  }

  async function importAll(incoming: TrainingData) {
    for (const exercise of incoming.custom) await db.saveCustomExercise(sb, userId, exercise)
    for (const workout of incoming.customWorkouts) await db.saveCustomWorkout(sb, userId, workout)
    for (const workout of incoming.workouts) await db.saveWorkout(sb, userId, workout)
    await db.saveGoal(sb, userId, incoming.settings.goal)
    setData(await db.loadAll(sb, userId))
  }

  // The ghost line: the most recent other session that used this movement.
  const lastFor = useCallback(
    (name: string, workout: Workout): LastSession | null => {
      let best: LastSession | null = null
      for (const candidate of data.workouts) {
        if (candidate.id === workout.id) continue
        if (candidate.date > workout.date) continue
        const exercise = candidate.exercises.find((e) => e.name === name && e.sets.length > 0)
        if (!exercise) continue
        if (!best || candidate.date > best.date) best = { date: candidate.date, exercise }
      }
      return best
    },
    [data.workouts],
  )

  const now = today()
  const ordered = data.workouts.slice().sort((a, b) => b.date.localeCompare(a.date))
  const todays = ordered.filter((w) => w.date === now)
  const past = ordered.filter((w) => w.date !== now)
  const targetWorkout = data.workouts.find((w) => w.id === pickerTarget) ?? null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-28">
      <header className="flex items-center justify-between pb-3 pt-5">
        <h1 className="text-xl font-semibold tracking-tight">Training Log</h1>
        <button
          onClick={() => setSheet('settings')}
          className="rounded-full bg-card px-3 py-1 text-xs text-muted ring-1 ring-edge"
        >
          {data.settings.goal}
        </button>
      </header>

      <div className="mb-4 flex gap-1 rounded-xl bg-card p-1 ring-1 ring-edge">
        {(['log', 'history'] as const).map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`flex-1 rounded-lg py-2 text-sm capitalize ${tab === name ? 'bg-accent text-ink' : 'text-muted'}`}
          >
            {name}
          </button>
        ))}
      </div>

      {error ? <p className="mb-3 rounded-xl bg-card p-3 text-xs text-accent ring-1 ring-edge">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading</p> : null}

      {!loading && tab === 'log' ? (
        <div className="flex flex-col gap-6">
          {todays.length === 0 ? (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted ring-1 ring-edge">
              Nothing logged today. Start a workout below.
            </p>
          ) : null}
          {todays.map((workout) => (
            <WorkoutEditor
              key={workout.id}
              workout={workout}
              goal={data.settings.goal}
              lastFor={lastFor}
              onChange={updateWorkout}
              onDelete={() => void removeWorkout(workout.id)}
              onAddExercise={() => {
                setPickerTarget(workout.id)
                setSheet('picker')
              }}
            />
          ))}
        </div>
      ) : null}

      {!loading && tab === 'history' ? (
        <div className="flex flex-col gap-3">
          {past.length === 0 ? <p className="text-sm text-muted">No past sessions yet.</p> : null}
          {past.map((workout) =>
            openHistory === workout.id ? (
              <div key={workout.id} className="rounded-2xl bg-card p-3 ring-1 ring-accent">
                <WorkoutEditor
                  workout={workout}
                  goal={data.settings.goal}
                  lastFor={lastFor}
                  onChange={updateWorkout}
                  onDelete={() => {
                    setOpenHistory(null)
                    void removeWorkout(workout.id)
                  }}
                  onAddExercise={() => {
                    setPickerTarget(workout.id)
                    setSheet('picker')
                  }}
                  showDate
                />
                <button
                  onClick={() => setOpenHistory(null)}
                  className="mt-3 w-full rounded-xl bg-ink py-2 text-sm text-muted ring-1 ring-edge"
                >
                  Close
                </button>
              </div>
            ) : (
              <button
                key={workout.id}
                onClick={() => setOpenHistory(workout.id)}
                className="rounded-2xl bg-card p-3 text-left ring-1 ring-edge"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{workout.title}</span>
                  <span className="shrink-0 text-xs text-muted num">{fmtDate(workout.date)}</span>
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {workout.exercises.slice(0, 3).map((exercise) => (
                    <p key={exercise.id} className="truncate text-xs text-muted num">
                      {exercise.name} {fmtSets(exercise)}
                    </p>
                  ))}
                  {workout.exercises.length > 3 ? (
                    <p className="text-xs text-muted num">and {workout.exercises.length - 3} more</p>
                  ) : null}
                </div>
                {workoutVolume(workout) > 0 ? (
                  <p className="mt-1 text-xs text-muted num">
                    {Math.round(workoutVolume(workout)).toLocaleString()} lb
                  </p>
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg px-4 pb-6">
        <button
          onClick={() => setSheet('start')}
          className="w-full rounded-2xl bg-accent py-4 text-base font-medium text-ink shadow-lg"
        >
          Start a workout
        </button>
      </div>

      {sheet === 'start' ? (
        <StartSheet
          customWorkouts={data.customWorkouts}
          onStart={startWorkout}
          onBuild={() => setSheet('builder')}
          onDelete={(id) => void removeCustomWorkout(id)}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'builder' ? (
        <CustomBuilder
          customs={data.custom}
          onSave={(name, items) => void saveCustomWorkout(name, items)}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'picker' && targetWorkout ? (
        <ExercisePicker
          customs={data.custom}
          onPick={(name, type) => addExercise(targetWorkout.id, name, type)}
          onCreate={(exercise) => void createCustomExercise(exercise)}
          onClose={() => {
            setSheet(null)
            setPickerTarget(null)
          }}
        />
      ) : null}

      {sheet === 'settings' ? (
        <SettingsSheet
          data={data}
          email={email}
          onGoal={(goal) => void setGoal(goal)}
          onImport={importAll}
          onSignOut={async () => {
            await flush()
            await sb.auth.signOut()
            window.location.href = '/login'
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </main>
  )
}
