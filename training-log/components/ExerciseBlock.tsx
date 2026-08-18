'use client'

import { useEffect, useState } from 'react'
import { coach, dropFrom } from '@/lib/coach'
import { fmtDate, fmtSets, isEmptySet, topSet, uid } from '@/lib/format'
import { beatsLast, PR_LABEL, prsFor, volumePr, type Bests } from '@/lib/gamify'
import { isFullSet, restFor } from '@/lib/rest'
import { fmtTime } from '@/lib/format'
import SetRow from './SetRow'
import type { Exercise, Goal, SetEntry } from '@/lib/types'

export interface LastSession {
  date: string
  exercise: Exercise
}

// Carries the weight forward: last set of this exercise, else the top set of
// the last session.
function seedSet(exercise: Exercise, last: LastSession | null): SetEntry {
  const previous = exercise.sets[exercise.sets.length - 1]
  const source = previous && !isEmptySet(previous, exercise.type) ? previous : last ? topSet(last.exercise) : null
  return {
    id: uid(),
    w: source?.w ?? null,
    r: null,
    rpe: null,
    t: null,
    d: null,
    raw: null,
  }
}

export default function ExerciseBlock({
  exercise,
  goal,
  showRpe,
  rpeBand,
  last,
  bests,
  live,
  onRest,
  label,
  nested,
  restSeconds,
  restOnComplete = true,
  onMove,
  onChange,
  onRemove,
}: {
  exercise: Exercise
  goal: Goal
  showRpe: boolean
  rpeBand?: [number, number]
  last: LastSession | null
  bests: Bests
  live: boolean
  onRest: (exerciseId: string, name: string, seconds: number) => void
  label?: string
  nested?: boolean
  restSeconds?: number
  restOnComplete?: boolean
  onMove: (direction: -1 | 1) => void
  onChange: (next: Exercise) => void
  onRemove: () => void
}) {
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(false), 3000)
    return () => clearTimeout(timer)
  }, [confirm])

  const working = exercise.sets.filter((s) => !s.drop)
  const filled = working.filter((s) => !isEmptySet(s, exercise.type))
  const basis = filled.length ? filled[filled.length - 1] : last ? topSet(last.exercise) ?? undefined : undefined
  const advice = coach(basis, exercise.type, goal, rpeBand)
  const fromLast = filled.length === 0 && !!basis

  const rest = restSeconds ?? restFor(exercise.name, exercise.type, goal)
  const lastRow = exercise.sets[exercise.sets.length - 1]
  const lastRowWeight = lastRow && lastRow.w != null ? lastRow.w : null

  function patchSet(id: string, patch: Partial<SetEntry>) {
    const before = exercise.sets.find((s) => s.id === id)
    const after = before ? { ...before, ...patch } : null
    onChange({ ...exercise, sets: exercise.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

    // The moment a set becomes a set is the moment you want the clock running.
    // Only on today's session: editing last Tuesday should not start a timer.
    // In a superset the clock only starts after the last movement in the group,
    // because the whole point is that you do not rest in between.
    if (
      live &&
      restOnComplete &&
      before &&
      after &&
      !isFullSet(before, exercise.type) &&
      isFullSet(after, exercise.type)
    ) {
      onRest(exercise.id, exercise.name, rest)
    }
  }

  return (
    <div className={`rounded-2xl p-3 ring-1 ring-edge ${nested ? 'bg-ink' : 'bg-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {label ? <span className="mr-2 text-xs num text-accent">{label}</span> : null}
            {exercise.name}
            {volumePr(exercise, bests) ? (
              <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-on-accent align-middle">
                Best session
              </span>
            ) : null}
          </h3>
          {last ? (
            <p className="mt-0.5 truncate text-xs text-muted num">
              {fmtDate(last.date)} &middot; {fmtSets(last.exercise)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">First time logging this</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => onMove(-1)} aria-label="Move up" className="rounded-lg px-2 py-1 text-xs text-muted">
            &uarr;
          </button>
          <button onClick={() => onMove(1)} aria-label="Move down" className="rounded-lg px-2 py-1 text-xs text-muted">
            &darr;
          </button>
          <button
            onClick={() => (confirm ? onRemove() : setConfirm(true))}
            className={`rounded-lg px-2 py-1 text-xs ${confirm ? 'bg-accent text-on-accent' : 'text-muted'}`}
          >
            {confirm ? 'Sure?' : 'Remove'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {(() => {
          // set numbers and the ghost comparison count working rows only, so a
          // drop between sets two and three does not shift everything after it
          const lastWorking = (last?.exercise.sets ?? []).filter((s) => !s.drop)
          let workingIndex = -1
          return exercise.sets.map((set) => {
          if (!set.drop) workingIndex += 1
          const i = workingIndex
          const records = prsFor(set, exercise.type, bests, goal)
          const beat = !set.drop && records.length === 0 && beatsLast(set, lastWorking[i], exercise.type)
          return (
            <div key={set.id} className="flex flex-col gap-1">
              <SetRow
                index={i}
                set={set}
                type={exercise.type}
                showRpe={showRpe}
                onChange={(patch) => patchSet(set.id, patch)}
                onRemove={() => onChange({ ...exercise, sets: exercise.sets.filter((s) => s.id !== set.id) })}
              />
              {records.length ? (
                <p className="pl-6 text-xs font-medium text-accent">
                  PR &middot; {records.map((k) => PR_LABEL[k]).join(', ')}
                </p>
              ) : beat ? (
                <p className="pl-6 text-xs text-muted">Up on last time</p>
              ) : null}
            </div>
          )
        })
        })()}
      </div>

      {advice ? (
        <p className="mt-2 text-xs text-accent">
          {fromLast ? 'Next set, ' : ''}
          {advice}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onChange({ ...exercise, sets: [...exercise.sets, seedSet(exercise, last)] })}
          className="flex-1 rounded-xl bg-ink py-2 text-sm text-muted ring-1 ring-edge"
        >
          Add set
        </button>
        {exercise.type === 'W' && lastRowWeight != null ? (
          <button
            onClick={() =>
              onChange({
                ...exercise,
                sets: [...exercise.sets, { id: uid(), drop: true, w: dropFrom(lastRowWeight) }],
              })
            }
            className="rounded-xl bg-ink px-3 py-2 text-sm text-muted ring-1 ring-edge"
          >
            Drop
          </button>
        ) : null}
        {live && rest > 0 && restOnComplete ? (
          <button
            onClick={() => onRest(exercise.id, exercise.name, rest)}
            className="rounded-xl bg-ink px-3 py-2 text-sm num text-muted ring-1 ring-edge"
          >
            Rest {fmtTime(rest)}
          </button>
        ) : null}
      </div>
    </div>
  )
}
