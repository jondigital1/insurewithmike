'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as db from '@/lib/db'
import { fmtDate, fmtSets, today, uid, workoutVolume } from '@/lib/format'
import { supabaseBrowser } from '@/lib/supabase/client'
import CustomBuilder from './CustomBuilder'
import Onboarding from './Onboarding'
import HelpSheet from './HelpSheet'
import ProfileSheet from './ProfileSheet'
import ProgressTab from './ProgressTab'
import StatsPanel from './StatsPanel'
import WaveCard from './WaveCard'
import RestBar, { useRest } from './RestTimer'
import ExercisePicker from './ExercisePicker'
import SettingsSheet from './SettingsSheet'
import StartSheet from './StartSheet'
import WorkoutEditor from './WorkoutEditor'
import type { LastSession } from './ExerciseBlock'
import { buildDay, dayById, needsCheckin, planFor, type Profile } from '@/lib/onboarding'
import { isEmptySet } from '@/lib/format'
import { bestsFor as computeBests, trainingGrid } from '@/lib/gamify'
import { waveWeek } from '@/lib/wave'
import { hardestFirst, topLoads } from '@/lib/order'
import {
  EMPTY_DATA,
  type CustomExercise,
  type CustomWorkoutItem,
  type Goal,
  type SetType,
  type TrainingData,
  type Workout,
} from '@/lib/types'

type SheetName = 'start' | 'picker' | 'builder' | 'settings' | 'profile' | 'help' | null

// Supabase throws plain objects as often as Error instances, and an unreadable
// failure would misclassify a dead connection as a real rejection.
function errText(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

// Unsaved work mirrored to this device, replayed on the next open. Keyed per
// user and per tab, so two open tabs cannot clobber each other's queue and one
// account's unsaved work never touches another's.
const MIRROR_PREFIX = 'training-log-unsaved-v1:'

interface MirrorShape {
  workouts?: Workout[]
  deletes?: string[]
}

function tabId(): string {
  try {
    let id = sessionStorage.getItem('training-log-tab')
    if (!id) {
      id = Math.random().toString(36).slice(2)
      sessionStorage.setItem('training-log-tab', id)
    }
    return id
  } catch {
    return 'tab'
  }
}

// A mirror entry that does not look like a workout is dropped rather than
// replayed: a malformed entry merged into state would crash every load after.
function validWorkout(w: unknown): w is Workout {
  const x = w as Workout
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.date === 'string' &&
    typeof x.title === 'string' &&
    Array.isArray(x.exercises) &&
    x.exercises.every((e) => e && typeof e.name === 'string' && Array.isArray(e.sets))
  )
}

export default function App({ userId, email }: { userId: string; email: string }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [data, setData] = useState<TrainingData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'log' | 'history' | 'progress'>('log')
  const [sheet, setSheet] = useState<SheetName>(null)
  const [pickerTarget, setPickerTarget] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [profileFocus, setProfileFocus] = useState<'minutes' | 'sore' | 'all'>('all')
  const [pendingStart, setPendingStart] = useState<{
    title: string
    items: CustomWorkoutItem[]
    sort: boolean
    dayId?: string
  } | null>(null)
  const rest = useRest()

  const pending = useRef(new Map<string, Workout>())
  const deletes = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(0)
  const flushing = useRef(false)
  // Sessions this visit generated from the plan. Only those get order advice:
  // a day the user wrote or picked deliberately is their business.
  const generated = useRef(new Set<string>())
  const latest = useRef<TrainingData>(data)
  latest.current = data
  const mirrorKey = useRef(`${MIRROR_PREFIX}${userId}:${tabId()}`)
  // True only if onboarding was already done when the app opened, so the tier 2
  // prompts wait for a later visit rather than stacking on the first one.
  const returning = useRef(false)

  // Everything not yet in Postgres is mirrored to this device, so a tab that
  // dies offline replays its unsaved work on the next open.
  const syncMirror = useCallback(() => {
    try {
      if (pending.current.size === 0 && deletes.current.size === 0) {
        localStorage.removeItem(mirrorKey.current)
      } else {
        localStorage.setItem(
          mirrorKey.current,
          JSON.stringify({
            workouts: [...pending.current.values()],
            deletes: [...deletes.current],
          }),
        )
      }
    } catch {
      // no localStorage means no mirror, the queue and retries still run
    }
  }, [])

  // A failed save stays in the queue and retries with backoff. Nothing typed is
  // ever dropped: it either reaches Postgres or waits, mirrored, until it can.
  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    let failed = false
    let failMsg = ''

    for (const [id, workout] of [...pending.current.entries()]) {
      try {
        await db.saveWorkout(sb, userId, workout)
        // Only clear the slot if nothing newer arrived while this was in flight.
        if (pending.current.get(id) === workout) pending.current.delete(id)
      } catch (e) {
        failed = true
        failMsg = errText(e)
        break
      }
    }

    if (!failed) {
      for (const id of [...deletes.current]) {
        try {
          await db.deleteWorkout(sb, id)
          deletes.current.delete(id)
        } catch (e) {
          failed = true
          failMsg = errText(e)
          break
        }
      }
    }

    syncMirror()
    flushing.current = false

    if (failed) {
      retryDelay.current = Math.min(Math.max(retryDelay.current * 2, 2000), 30000)
      // A dead connection gets reassurance; a real rejection gets its message.
      // Either way the queue holds the work and keeps retrying.
      const offline =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        /fetch|network|connection|load failed/i.test(failMsg)
      setError(
        offline
          ? 'Offline. Your sets are safe on this phone and will save when the connection returns.'
          : `Save failed: ${failMsg}. Your sets are held on this phone and retried.`,
      )
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), retryDelay.current)
    } else {
      retryDelay.current = 0
      setError('')
      // Edits made while this flush was in flight are still queued: the guard
      // turned their flush call away, so give them their own pass now.
      if (pending.current.size || deletes.current.size) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void flush(), 100)
      }
    }
  }, [sb, userId, syncMirror])

  // Every edit lands in state immediately and hits Postgres a beat later, so
  // typing a set never waits on the network.
  const queueSave = useCallback(
    (workout: Workout) => {
      pending.current.set(workout.id, workout)
      syncMirror()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 400)
    },
    [flush, syncMirror],
  )

  useEffect(() => {
    let alive = true
    db.loadAll(sb, userId)
      .then((loaded) => {
        if (!alive) return
        returning.current = loaded.settings.onboardedAt !== null

        // A previous visit may have died with unsaved work. Every mirror this
        // user left on this device, from any tab, is replayed: the mirror is
        // by definition newer than the server for those workouts. Invalid
        // entries are dropped rather than replayed, and consumed keys removed
        // so a bad one cannot crash every load after.
        try {
          const prefix = `${MIRROR_PREFIX}${userId}:`
          const keys: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith(prefix)) keys.push(key)
          }
          for (const key of keys) {
            try {
              const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as MirrorShape | null
              for (const w of saved?.workouts ?? []) {
                if (validWorkout(w)) pending.current.set(w.id, w)
              }
              for (const id of saved?.deletes ?? []) {
                if (typeof id === 'string') deletes.current.add(id)
              }
            } catch {
              // an unreadable mirror is treated as absent
            }
            if (key !== mirrorKey.current) localStorage.removeItem(key)
          }
          if (pending.current.size || deletes.current.size) {
            const replaced = loaded.workouts
              .filter((w) => !deletes.current.has(w.id))
              .map((w) => pending.current.get(w.id) ?? w)
            const known = new Set(replaced.map((w) => w.id))
            const extra = [...pending.current.values()].filter((w) => !known.has(w.id))
            loaded = { ...loaded, workouts: [...extra, ...replaced] }
            syncMirror()
            setTimeout(() => void flush(), 100)
          }
        } catch {
          // no localStorage, no replay, the app still loads
        }

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
    window.addEventListener('online', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('focusout', onLeave)
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('online', onLeave)
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

  function removeWorkout(id: string) {
    pending.current.delete(id)
    deletes.current.add(id)
    syncMirror()
    setData((prev) => ({ ...prev, workouts: prev.workouts.filter((w) => w.id !== id) }))
    void flush()
  }

  function startWorkout(title: string, items: CustomWorkoutItem[], sort = false, dayId?: string) {
    // The one tier 2 question worth asking up front, and only at the moment it
    // is a useful question about today rather than an obstacle at signup.
    if (data.settings.profile.minutes === undefined && items.length > 0) {
      setPendingStart({ title, items, sort, dayId })
      setProfileFocus('minutes')
      setSheet('profile')
      return
    }
    reallyStart(title, items, sort)
  }

  // The minutes answer has to shape the session it interrupted, so a plan day
  // is rebuilt against the fresh profile rather than started from stale items.
  function resumePendingStart(next: Profile) {
    if (!pendingStart) return
    const { title, items, sort, dayId } = pendingStart
    setPendingStart(null)
    const day = dayId ? dayById(dayId) : null
    reallyStart(title, day ? buildDay(day, next) : items, sort)
  }

  function reallyStart(title: string, items: CustomWorkoutItem[], sort = false) {
    // Superset tags flow straight through from templates and saved workouts.
    let exercises: Workout['exercises'] = items.map((item) => ({
      id: uid(),
      name: item.name,
      type: item.type,
      superset: item.superset ?? null,
      sets: [{ id: uid() }],
    }))

    // Hardest first applies only to sessions the app generated from the plan.
    // A day the user wrote, or picked by name, keeps the order it was written
    // in: ordering with intent is not a mistake to correct.
    if (sort) exercises = hardestFirst(exercises, topLoads(latest.current.workouts))

    const workout: Workout = { id: uid(), date: today(), title, exercises }
    if (sort) generated.current.add(workout.id)
    setData((prev) => ({ ...prev, workouts: [workout, ...prev.workouts] }))
    queueSave(workout)
    setSheet(null)
    setTab('log')
  }

  function addExercise(workoutId: string, name: string, type: SetType, superset: string | null) {
    const workout = latest.current.workouts.find((w) => w.id === workoutId)
    if (!workout) return
    updateWorkout({
      ...workout,
      exercises: [...workout.exercises, { id: uid(), name, type, superset, sets: [{ id: uid() }] }],
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
    startWorkout(name, items, false)
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
    if (day) reallyStart(day.name, buildDay(day, profile), true)
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
  const loads = useMemo(() => topLoads(data.workouts), [data.workouts])

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

  const trainedLast28 = trainingGrid(data.workouts, now).filter((d) => d.trained).length
  const behind =
    plan !== null && needsCheckin(profile, data.settings.onboardedAt, trainedLast28, now)

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSheet('help')}
            aria-label="Help"
            className="rounded-full bg-card px-3 py-1 text-xs text-muted ring-1 ring-edge"
          >
            ?
          </button>
          <button
            onClick={() => setSheet('settings')}
            className="rounded-full bg-card px-3 py-1 text-xs text-muted ring-1 ring-edge"
          >
            {data.settings.goal}
          </button>
        </div>
      </header>

      <div className="mb-4 flex gap-1 rounded-xl bg-card p-1 ring-1 ring-edge">
        {(['log', 'history', 'progress'] as const).map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`flex-1 rounded-lg py-2 text-sm capitalize ${tab === name ? 'bg-accent text-on-accent' : 'text-muted'}`}
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

      {!loading && tab === 'log' && behind ? (
        <div className="mb-4 rounded-2xl bg-card p-4 ring-1 ring-edge">
          <p className="text-xs uppercase tracking-wide text-muted">The last four weeks</p>
          <p className="mt-1 text-2xl num">{trainedLast28} / 28 days</p>
          <p className="mt-1 text-sm text-muted">
            You planned {profile.days ?? plan?.days} a week. Two days done properly beats{' '}
            {profile.days ?? plan?.days} missed. Want the shorter plan? Either answer sticks, and
            days a week can always change in Settings.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() =>
                void saveProfile({ ...profile, days: 2, checkinDismissedAt: new Date().toISOString() })
              }
              className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-on-accent"
            >
              Move to 2 days
            </button>
            <button
              onClick={() =>
                void saveProfile({ ...profile, checkinDismissedAt: new Date().toISOString() })
              }
              className="rounded-xl px-4 py-2 text-sm text-muted"
            >
              Keep my plan
            </button>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'log' && wantsSore && !behind ? (
        <div className="mb-4 rounded-2xl bg-card p-4 ring-1 ring-edge">
          <p className="text-sm">
            Anything giving you trouble? Flag a joint and sessions swap around it.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setProfileFocus('sore')
                setSheet('profile')
              }}
              className="rounded-xl bg-ink px-4 py-2 text-sm ring-1 ring-edge"
            >
              Flag something
            </button>
            <button
              onClick={() => void saveProfile({ ...profile, sore: [] })}
              className="rounded-xl px-4 py-2 text-sm text-muted"
            >
              All good
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
              loads={loads}
              offerSort={generated.current.has(workout.id)}
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

      {!loading && tab === 'progress' ? <ProgressTab workouts={data.workouts} /> : null}

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
                  loads={loads}
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
      {(tab !== 'log' || todays.length === 0) && !rest.rest ? (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg px-4 pb-6">
          <button
            onClick={() => setSheet('start')}
            className="w-full rounded-2xl bg-accent py-4 text-base font-medium text-on-accent shadow-lg"
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
          onPick={(name, type, superset) => addExercise(targetWorkout.id, name, type, superset)}
          onCreate={(exercise) => void createCustomExercise(exercise)}
          onClose={() => {
            setSheet(null)
            setPickerTarget(null)
          }}
        />
      ) : null}

      {sheet === 'profile' ? (
        <ProfileSheet
          profile={profile}
          focus={profileFocus}
          onSave={(next) => {
            void saveProfile(next)
            setSheet(null)
            resumePendingStart(next)
          }}
          onClose={() => {
            setSheet(null)
            resumePendingStart(profile)
          }}
        />
      ) : null}

      {sheet === 'help' ? <HelpSheet onClose={() => setSheet(null)} /> : null}

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
          onHelp={() => setSheet('help')}
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
