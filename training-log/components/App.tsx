'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as db from '@/lib/db'
import { fmtDate, fmtSets, today, uid, workoutVolume } from '@/lib/format'
import { supabaseBrowser } from '@/lib/supabase/client'
import CustomBuilder from './CustomBuilder'
import Onboarding from './Onboarding'
import ProfileSheet from './ProfileSheet'
import StatsPanel from './StatsPanel'
import WaveCard from './WaveCard'
import RestBar, { useRest } from './RestTimer'
import ExercisePicker from './ExercisePicker'
import SettingsSheet from './SettingsSheet'
import StartSheet from './StartSheet'
import WorkoutEditor from './WorkoutEditor'
import type { LastSession } from './ExerciseBlock'
import { buildDay, dayById, firstMonth, planFor, type Profile } from '@/lib/onboarding'
import { isEmptySet } from '@/lib/format'
import { bestsFor as computeBests } from '@/lib/gamify'
import { waveWeek } from '@/lib/wave'
import {
  EMPTY_DATA,
  type CustomExercise,
  type CustomWorkoutItem,
  type Goal,
  type SetType,
  type TrainingData,
  type Workout,
} from '@/lib/types'

type SheetName = 'start' | 'picker' | 'builder' | 'settings' | 'profile' | null

export default function App({ userId, email }: { userId: string; email: string }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [data, setData] = useState<TrainingData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'log' | 'history'>('log')
  const [sheet, setSheet] = useState<SheetName>(null)
  const [pickerTarget, setPickerTarget] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [profileFocus, setProfileFocus] = useState<'minutes' | 'sore' | 'all'>('all')
  const [pendingStart, setPendingStart] = useState<{ title: string; items: CustomWorkoutItem[] } | null>(null)
  const [askedSore, setAskedSore] = useState(false)
  const [dismissedCheckin, setDismissedCheckin] = useState(false)
  const rest = useRest()

  const pending = useRef(new Map<string, Workout>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<TrainingData>(data)
  latest.current = data
  // True only if onboarding was already done when the app opened, so the tier 2
  // prompts wait for a later visit rather than stacking on the first one.
  const returning = useRef(false)

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
      timer.current = setTimeout(() => void flush(), 400)
    },
    [flush],
  )

  useEffect(() => {
    let alive = true
    db.loadAll(sb, userId)
      .then((loaded) => {
        if (!alive) return
        returning.current = loaded.settings.onboardedAt !== null
        setData(loaded)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sb, userId])

  // A set typed and not yet written is the one thing this app cannot lose, so
  // anything that looks like leaving flushes the queue: the field losing focus,
  // the tab going to the background, the page going away.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onLeave = () => void flush()
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('focusout', onLeave)
    window.addEventListener('pagehide', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('focusout', onLeave)
      window.removeEventListener('pagehide', onLeave)
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
    // The one tier 2 question worth asking up front, and only at the moment it
    // is a useful question about today rather than an obstacle at signup.
    if (data.settings.profile.minutes === undefined && items.length > 0) {
      setPendingStart({ title, items })
      setProfileFocus('minutes')
      setSheet('profile')
      return
    }
    reallyStart(title, items)
  }

  function reallyStart(title: string, items: CustomWorkoutItem[]) {
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

  async function saveProfile(profile: Profile, onboardedAt?: string) {
    const stamp = onboardedAt ?? data.settings.onboardedAt
    setData((prev) => ({ ...prev, settings: { ...prev.settings, profile, onboardedAt: stamp } }))
    try {
      await db.saveProfile(sb, userId, profile, stamp)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answers')
    }
  }

  async function finishOnboarding(profile: Profile, goal: Goal, startDayId: string | null) {
    const stamp = new Date().toISOString()
    setData((prev) => ({ ...prev, settings: { goal, profile, onboardedAt: stamp } }))
    try {
      await db.saveProfile(sb, userId, profile, stamp)
      await db.saveGoal(sb, userId, goal)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answers')
    }
    const day = startDayId ? dayById(startDayId) : null
    if (day) reallyStart(day.name, buildDay(day, profile))
  }

  async function setGoal(goal: Goal) {
    setData((prev) => ({ ...prev, settings: { ...prev.settings, goal } }))
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
        // A session with nothing written in it is not a last session. Without
        // this the ghost line reads "? x ?" off an untouched set row.
        const exercise = candidate.exercises.find(
          (e) => e.name === name && e.sets.some((s) => !isEmptySet(s, e.type)),
        )
        if (!exercise) continue
        if (!best || candidate.date > best.date) best = { date: candidate.date, exercise }
      }
      return best
    },
    [data.workouts],
  )

  // The records a set has to beat, gathered from every earlier session of the
  // same movement. Sits alongside the ghost line rather than replacing it.
  const bestsFor = useCallback(
    (name: string, workout: Workout) => computeBests(data.workouts, name, workout.id, workout.date),
    [data.workouts],
  )

  const now = today()
  const profile = data.settings.profile
  const plan = data.settings.onboardedAt ? planFor(profile, data.settings.goal) : null
  const rpeOn = !plan || plan.showRpe
  // The wave only means anything once the RPE box exists to aim with.
  const wave = rpeOn ? waveWeek(profile, now) : null

  // Only ask about sore joints once a session is behind them, on a later visit.
  // Asking the moment onboarding hands over the first session is two sheets back
  // to back, which is the interrogation this whole flow exists to avoid.
  const hasTrained = data.workouts.some(
    (w) => w.date < now && w.exercises.some((e) => e.sets.some((s) => !isEmptySet(s, e.type))),
  )
  const wantsSore = hasTrained && returning.current && profile.sore === undefined

  const month = firstMonth(data.workouts.map((w) => w.date))
  const behind =
    !dismissedCheckin &&
    plan !== null &&
    month !== null &&
    month.elapsed >= 28 &&
    month.days < Math.max(8, plan.days * 3)

  const ordered = data.workouts.slice().sort((a, b) => b.date.localeCompare(a.date))
  const todays = ordered.filter((w) => w.date === now)
  const past = ordered.filter((w) => w.date !== now)
  const targetWorkout = data.workouts.find((w) => w.id === pickerTarget) ?? null

  if (!loading && !data.settings.onboardedAt) {
    return <Onboarding onFinish={(p, g, day) => void finishOnboarding(p, g, day)} />
  }

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

      {!loading && tab === 'log' && wave ? (
        <WaveCard week={wave} workouts={data.workouts} today={now} />
      ) : null}

      {!loading && tab === 'log' && behind && month ? (
        <div className="mb-4 rounded-2xl bg-card p-4 ring-1 ring-accent">
          <p className="text-xs uppercase tracking-wide text-muted">Four weeks in</p>
          <p className="mt-1 text-2xl num text-accent">{month.days} / 28</p>
          <p className="mt-1 text-sm">
            You said {profile.days ?? plan?.days} days a week. You have been managing about{' '}
            {Math.max(1, Math.round((month.days / 4) * 10) / 10)}.
          </p>
          <p className="mt-2 text-sm text-muted">
            Two days done properly beats {profile.days ?? plan?.days} missed. Want the shorter plan?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                void saveProfile({ ...profile, days: 2 })
                setDismissedCheckin(true)
              }}
              className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-ink"
            >
              Move to 2 days
            </button>
            <button
              onClick={() => setDismissedCheckin(true)}
              className="rounded-xl px-4 py-2 text-sm text-muted"
            >
              Leave it
            </button>
          </div>
        </div>
      ) : null}

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
              showRpe={rpeOn}
              rpeBand={wave?.rpe}
              lastFor={lastFor}
              bestsFor={bestsFor}
              live
              onRest={rest.start}
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
          <StatsPanel workouts={data.workouts} today={now} target={profile.days ?? plan?.days ?? 3} />
          {past.length === 0 ? <p className="text-sm text-muted">No past sessions yet.</p> : null}
          {past.map((workout) =>
            openHistory === workout.id ? (
              <div key={workout.id} className="rounded-2xl bg-card p-3 ring-1 ring-accent">
                <WorkoutEditor
                  workout={workout}
                  goal={data.settings.goal}
                  showRpe={rpeOn}
                  rpeBand={wave?.rpe}
                  lastFor={lastFor}
                  bestsFor={bestsFor}
                  live={workout.date === now}
                  onRest={rest.start}
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

      {/* Sticky only when there is nothing to cover. Mid session the big orange
          bar would sit on top of the set you are typing into. */}
      {(tab === 'history' || todays.length === 0) && !rest.rest ? (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg px-4 pb-6">
          <button
            onClick={() => setSheet('start')}
            className="w-full rounded-2xl bg-accent py-4 text-base font-medium text-ink shadow-lg"
          >
            Start a workout
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSheet('start')}
          className="mt-8 w-full rounded-2xl bg-card py-4 text-base text-muted ring-1 ring-edge"
        >
          Start another workout
        </button>
      )}

      {rest.rest ? (
        <RestBar
          rest={rest.rest}
          remaining={rest.remaining}
          onExtend={rest.extend}
          onStop={rest.stop}
        />
      ) : null}

      {sheet === 'start' ? (
        <StartSheet
          plan={plan}
          profile={profile}
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

      {sheet === 'profile' || (wantsSore && !askedSore && sheet === null) ? (
        <ProfileSheet
          profile={profile}
          focus={sheet === 'profile' ? profileFocus : 'sore'}
          onSave={(next) => {
            void saveProfile(next)
            setSheet(null)
            setAskedSore(true)
            if (pendingStart) {
              const { title, items } = pendingStart
              setPendingStart(null)
              reallyStart(title, items)
            }
          }}
          onClose={() => {
            // Closing the contextual prompt is an answer of nothing. Without
            // recording it the question comes back on every reload, which is
            // nagging, and nagging is how an app gets deleted.
            if (sheet !== 'profile' && profile.sore === undefined) {
              void saveProfile({ ...profile, sore: [] })
            }
            setSheet(null)
            setAskedSore(true)
            if (pendingStart) {
              const { title, items } = pendingStart
              setPendingStart(null)
              reallyStart(title, items)
            }
          }}
        />
      ) : null}

      {sheet === 'settings' ? (
        <SettingsSheet
          data={data}
          email={email}
          onGoal={(goal) => void setGoal(goal)}
          onImport={importAll}
          onEditProfile={() => {
            setProfileFocus('all')
            setSheet('profile')
          }}
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
